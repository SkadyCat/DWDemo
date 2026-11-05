"""Generate TWN GLBs from approved orthographic views via the Meshy API.

Default: report the local plan without sending requests.
  python scripts/meshy-town.py --run --concurrency 3
  python scripts/meshy-town.py --status
  python scripts/meshy-town.py --balance

Set MESHY_API_KEY in the process or Windows user environment, or supply a
local --key-file. Keys and input data URIs are never written to task records.
Creation requests with an uncertain result are not automatically resubmitted.
API reference: https://docs.meshy.ai/en/api/multi-image-to-3d
"""
import argparse
import base64
import hashlib
import json
import os
import re
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from contextlib import contextmanager
from pathlib import Path

API = 'https://api.meshy.ai/openapi/v1'
ENDPOINT = '/multi-image-to-3d'
ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / 'design/town/town-prompts.json'
OUT = ROOT / 'design/town/TWN'
DEFAULT_STATE = ROOT / 'work/meshy-town'
TERMINAL = {'SUCCEEDED', 'FAILED', 'CANCELED'}
AMBIGUOUS = {'SUBMITTING', 'SUBMISSION_UNKNOWN'}


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    os.replace(temporary, path)


def load_json(path, fallback=None):
    return json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else fallback


def api_key(key_file=None):
    if key_file:
        raw = Path(key_file).read_text(encoding='utf-8-sig').strip()
        if raw.startswith('{'):
            config = json.loads(raw)
            if config.get('api_base_url', 'https://api.meshy.ai').rstrip('/') != 'https://api.meshy.ai':
                raise ValueError('The supplied Meshy config must use the official API host')
            raw = config.get('MESHY_API_KEY') or config.get('api_key', '')
        if not isinstance(raw, str) or not raw.strip():
            raise ValueError('The supplied key file has no Meshy API key')
        return raw.strip()
    key = os.environ.get('MESHY_API_KEY', '').strip()
    if key:
        return key
    if os.name == 'nt':
        import winreg
        for hive, location in ((winreg.HKEY_CURRENT_USER, 'Environment'), (winreg.HKEY_LOCAL_MACHINE, r'SYSTEM\CurrentControlSet\Control\Session Manager\Environment')):
            try:
                with winreg.OpenKey(hive, location) as entry:
                    value = winreg.QueryValueEx(entry, 'MESHY_API_KEY')[0]
                if isinstance(value, str) and value.strip():
                    return value.strip()
            except OSError:
                continue
    raise ValueError('MESHY_API_KEY is not configured; no Meshy task was created')


class ApiError(Exception):
    def __init__(self, status, retry_after=15):
        self.status = status
        self.retry_after = retry_after
        super().__init__(f'Meshy HTTP {status}')


def api_request(method, path, key, body=None, stem=None):
    headers = {'Authorization': 'Bearer '+key, 'Content-Type': 'application/json'}
    if stem:
        headers['X-Meshy-Metadata'] = 'project=RuleStudio,theme=TWN,asset='+stem
    data = json.dumps(body).encode('utf-8') if body is not None else None
    request = urllib.request.Request(API+path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            retry_after = max(1, int(error.headers.get('Retry-After', 15)))
        except ValueError:
            retry_after = 15
        # The remote response is deliberately not echoed: it could contain input data.
        raise ApiError(error.code, retry_after) from None


def settings(row):
    category = row['id'].split('-')[1]
    if category == 'FLR':
        polycount = 600
    elif category == 'WAL':
        polycount = 1200
    elif category == 'STR':
        polycount = 6000 if row['view'] != '扁平' else 2000
    elif row['file'] == 'TWN_PRP_mapdevice_A':
        polycount = 3000
    else:
        polycount = 1500
    return {'ai_model': 'meshy-7.1', 'geometry_resolution': 'standard', 'should_texture': True, 'texture_model': 'meshy-7', 'enable_pbr': True, 'texture_resolution': '2k', 'should_remesh': True, 'topology': 'triangle', 'target_polycount': polycount, 'image_enhancement': False, 'target_formats': ['glb'], 'multi_view_thumbnails': True}


def views_ready(folder, stem):
    try:
        marker = load_json(folder/(stem+'_views.json'))
        if not marker or marker.get('stem') != stem or len(marker.get('files', [])) != 4:
            return False
        for entry in marker['files']:
            path = (ROOT / entry['file']).resolve()
            if path.parent != folder.resolve() or not path.is_file() or sha(path) != entry['sha256']:
                return False
        return True
    except (OSError, ValueError, KeyError):
        return False


def inventory(only=None):
    rows = [r for r in load_json(SPEC)['assets'] if r['view'] != '只出概念图']
    requested = set(only or [])
    if requested - {r['file'] for r in rows}:
        raise ValueError('Unknown asset name in --only')
    priority = ['TWN_STR_hall_A', 'TWN_STR_lampwell_A', 'TWN_PRP_mapdevice_A', 'TWN_STR_house_A', 'TWN_STR_house_B', 'TWN_STR_house_C']
    rows.sort(key=lambda r: priority.index(r['file']) if r['file'] in priority else len(priority))
    jobs = []
    for row in rows:
        if requested and row['file'] not in requested:
            continue
        stem = row['file']
        if not re.fullmatch(r'TWN_[A-Z]{3}_[a-z_]+_[ABC]', stem):
            raise ValueError('Invalid asset stem')
        folder = OUT / stem
        # Meshy uses image zero as the FRONT. Flat-sheet display order is top/front/side.
        view_order = ['front', 'side', 'top'] if row['view'] == '扁平' else ['front', 'side', 'back']
        views = [folder/(stem+'_'+name+'.png') for name in view_order]
        ready = views_ready(folder, stem)
        jobs.append({'row': row, 'stem': stem, 'folder': folder, 'views': views, 'viewOrder': view_order, 'ready': ready, 'settings': settings(row)})
    return jobs


def input_record(job):
    return {'settings': job['settings'], 'viewOrder': job['viewOrder'], 'views': [{'file': path.relative_to(ROOT).as_posix(), 'sha256': sha(path)} for path in job['views']]}


def create_task(job, state_path, key, request=api_request):
    existing = load_json(state_path)
    if existing and (existing.get('taskId') or existing.get('status') in AMBIGUOUS):
        return existing
    snapshot = input_record(job)
    record = {'stem': job['stem'], 'status': 'SUBMITTING', 'createdLocallyAt': time.time(), 'input': snapshot}
    # Persist the intent before the non-idempotent network request.
    atomic_json(state_path, record)
    body = dict(job['settings'])
    body['image_urls'] = ['data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode('ascii') for path in job['views']]
    try:
        response = request('POST', ENDPOINT, key, body, job['stem'])
        task_id = response.get('result')
        if not isinstance(task_id, str) or not re.fullmatch(r'[A-Za-z0-9-]+', task_id):
            raise ValueError('Meshy returned no valid task ID')
        record.update(taskId=task_id, status='PENDING', submittedAt=time.time())
    except ApiError as error:
        if error.status == 429:
            record.update(status='RATE_LIMITED', nextAttemptAt=time.time()+error.retry_after)
        elif error.status in (400, 401, 402, 403, 404, 422):
            record.update(status='REJECTED', httpStatus=error.status)
        else:
            record.update(status='SUBMISSION_UNKNOWN', httpStatus=error.status)
        atomic_json(state_path, record)
        if error.status in (401, 402):
            raise
        return record
    except Exception:
        record.update(status='SUBMISSION_UNKNOWN')
        atomic_json(state_path, record)
        raise RuntimeError('Task creation outcome is unknown. Reconcile the Meshy dashboard before resubmission.') from None
    atomic_json(state_path, record)
    return record


def glb_info(path):
    raw = Path(path).read_bytes()
    if len(raw) < 20:
        raise ValueError('Downloaded GLB is too short')
    magic, version, length = struct.unpack_from('<4sII', raw)
    if magic != b'glTF' or version != 2 or length != len(raw):
        raise ValueError('Invalid GLB header or length')
    offset, document, binary = 12, None, None
    while offset < len(raw):
        if offset+8 > len(raw):
            raise ValueError('Truncated GLB chunk header')
        size, chunk_type = struct.unpack_from('<II', raw, offset)
        offset += 8
        if size % 4 or offset+size > len(raw):
            raise ValueError('Invalid GLB chunk boundary')
        if chunk_type == 0x4e4f534a:
            document = json.loads(raw[offset:offset+size].decode('utf-8'))
        elif chunk_type == 0x004e4942:
            binary = raw[offset:offset+size]
        offset += size
    if not document or not document.get('meshes'):
        raise ValueError('GLB has no mesh geometry')
    buffers = document.get('buffers', [])
    if binary is None or not buffers or any(b.get('uri') for b in buffers) or len(buffers) != 1 or buffers[0].get('byteLength', 0)>len(binary):
        raise ValueError('GLB must contain its binary data')
    views = document.get('bufferViews', [])
    for view in views:
        if view.get('buffer', 0) != 0 or view.get('byteOffset', 0)<0 or view.get('byteLength', 0)<0 or view.get('byteOffset', 0)+view.get('byteLength', 0)>len(binary):
            raise ValueError('GLB buffer view exceeds its binary data')
    triangles = 0
    accessors = document.get('accessors', [])
    for mesh in document['meshes']:
        for primitive in mesh.get('primitives', []):
            if primitive.get('mode', 4) != 4:
                raise ValueError('Expected triangle topology')
            index = primitive.get('indices', primitive.get('attributes', {}).get('POSITION'))
            if index is None or index >= len(accessors):
                raise ValueError('GLB has invalid geometry accessors')
            triangles += accessors[index]['count']//3
    external = [image['uri'] for image in document.get('images', []) if image.get('uri') and not image['uri'].startswith('data:')]
    if triangles < 1:
        raise ValueError('GLB has no triangles')
    if not document.get('images') or external:
        raise ValueError('GLB must include embedded textures')
    return {'meshes': len(document['meshes']), 'triangles': triangles, 'materials': len(document.get('materials', [])), 'embeddedImages': len(document.get('images', [])), 'sha256': sha(path), 'bytes': len(raw)}


def download(url, target, validator=None):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or not parsed.hostname:
        raise ValueError('Meshy artifact URL must use HTTPS')
    temporary = target.with_suffix(target.suffix+'.download')
    target.parent.mkdir(parents=True, exist_ok=True)
    # Never forward the Meshy API Authorization header to an artifact/CDN host.
    with urllib.request.urlopen(url, timeout=120) as response, temporary.open('wb') as output:
        if response.status != 200:
            raise ValueError('Artifact request did not return a complete response')
        expected = response.headers.get('Content-Length')
        received = 0
        while True:
            block = response.read(1024*1024)
            if not block:
                break
            output.write(block)
            received += len(block)
    if expected is not None and received != int(expected):
        raise ValueError('Incomplete artifact download')
    if validator is not None:
        validator(temporary)
    os.replace(temporary, target)


def collect(job, record, task):
    target = job['folder']/(job['stem']+'.glb')
    try:
        info = glb_info(target) if target.exists() else None
    except (OSError, ValueError):
        info = None
    if info is None:
        url = task.get('model_urls', {}).get('glb')
        if not url:
            raise ValueError('Succeeded task has no GLB URL')
        download(url, target, validator=glb_info)
    info = glb_info(target)
    preview = task.get('thumbnail_url')
    if preview:
        preview_path = job['folder']/(job['stem']+'_mesh-preview.png')
        if not preview_path.exists():
            download(preview, preview_path)
    for name, url in task.get('thumbnail_urls', {}).items():
        if name in ('front', 'right', 'back', 'left') and url:
            preview_path = job['folder']/(job['stem']+'_mesh-'+name+'.png')
            if not preview_path.exists():
                download(url, preview_path)
    record.update(downloaded=True, glbFile=target.relative_to(ROOT).as_posix(), glb=info, visualReview='pending', consumedCredits=task.get('consumed_credits'))


def poll_task(job, state_path, key):
    record = load_json(state_path)
    task = api_request('GET', ENDPOINT+'/'+record['taskId'], key)
    record.update(status=task['status'], progress=task.get('progress'), checkedAt=time.time())
    # Persist the response before downloading; failed downloads resume the existing task.
    atomic_json(state_path, record)
    if task['status'] == 'SUCCEEDED' and not record.get('downloaded'):
        collect(job, record, task)
        atomic_json(state_path, record)
    return record


@contextmanager
def run_lock(state_dir):
    lock = state_dir/'runner.lock'
    try:
        descriptor = os.open(lock, os.O_CREAT|os.O_EXCL|os.O_WRONLY)
    except FileExistsError:
        raise ValueError('Another runner owns this state directory. Check its process before removing runner.lock.') from None
    try:
        os.write(descriptor, str(os.getpid()).encode('ascii'))
        os.close(descriptor)
        yield
    finally:
        lock.unlink(missing_ok=True)


def run(jobs, state_dir, key, concurrency, once, max_seconds):
    started = time.monotonic()
    balance = api_request('GET', '/balance', key)
    emit({'event': 'balance', 'credits': balance.get('balance')})
    with run_lock(state_dir):
        while time.monotonic()-started < max_seconds:
            for job in jobs:
                job['ready'] = views_ready(job['folder'], job['stem'])
            for job in jobs:
                state_path = state_dir/(job['stem']+'.json')
                record = load_json(state_path, {})
                if record.get('taskId') and (record.get('status') not in TERMINAL or (record.get('status') == 'SUCCEEDED' and not record.get('downloaded'))):
                    try:
                        record = poll_task(job, state_path, key)
                        emit({'asset': job['stem'], 'status': record['status'], 'progress': record.get('progress'), 'downloaded': record.get('downloaded', False)})
                    except ApiError as error:
                        if error.status in (401, 402):
                            raise
                        emit({'asset': job['stem'], 'pollError': str(error)})
                    except (OSError, ValueError) as error:
                        emit({'asset': job['stem'], 'artifactError': type(error).__name__})
            active = sum(bool((r:=load_json(state_dir/(j['stem']+'.json'), {})).get('taskId')) and r.get('status') not in TERMINAL for j in jobs)
            for job in jobs:
                if active >= concurrency:
                    break
                state_path = state_dir/(job['stem']+'.json')
                record = load_json(state_path, {})
                if not job['ready'] or record.get('taskId') or record.get('status') in AMBIGUOUS or record.get('status') == 'REJECTED' or record.get('nextAttemptAt', 0)>time.time():
                    continue
                if not record and (job['folder']/(job['stem']+'.glb')).exists():
                    raise ValueError('Existing GLB without task provenance; inspect before submitting')
                record = create_task(job, state_path, key)
                emit({'asset': job['stem'], 'status': record['status'], 'taskId': record.get('taskId')})
                active += bool(record.get('taskId'))
            records = [load_json(state_dir/(j['stem']+'.json'), {}) for j in jobs]
            emit({'event': 'summary', 'assets': len(jobs), 'readyInputs': sum(j['ready'] for j in jobs), 'states': dict(Counter(r.get('status', 'WAITING_INPUT') for r in records)), 'downloaded': sum(bool(r.get('downloaded')) for r in records)})
            pending = any(not j['ready'] or (not r or r.get('status') == 'RATE_LIMITED' or (r.get('taskId') and (r.get('status') not in TERMINAL or (r.get('status') == 'SUCCEEDED' and not r.get('downloaded'))))) for j,r in zip(jobs, records))
            if once or not pending:
                return
            time.sleep(10)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true', help='Create paid Meshy tasks and retrieve results')
    parser.add_argument('--status', action='store_true')
    parser.add_argument('--balance', action='store_true')
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--concurrency', type=int, default=3, choices=range(1, 11))
    parser.add_argument('--max-seconds', type=int, default=1200)
    parser.add_argument('--state-dir', type=Path, default=DEFAULT_STATE)
    parser.add_argument('--key-file', type=Path)
    parser.add_argument('--only', nargs='+')
    args = parser.parse_args()
    jobs = inventory(args.only)
    if args.balance:
        emit(api_request('GET', '/balance', api_key(args.key_file)))
    elif args.run:
        key = api_key(args.key_file)
        args.state_dir.mkdir(parents=True, exist_ok=True)
        run(jobs, args.state_dir, key, args.concurrency, args.once, args.max_seconds)
    else:
        emit({'assets': len(jobs), 'readyInputs': sum(j['ready'] for j in jobs), 'estimatedCreditsAt30PerModel': 30*len(jobs), 'jobs': [{'asset': j['stem'], 'ready': j['ready'], 'viewOrder': j['viewOrder'], 'targetPolycount': j['settings']['target_polycount'], 'status': load_json(args.state_dir/(j['stem']+'.json'), {}).get('status', 'WAITING_INPUT')} for j in jobs]})


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, ApiError, OSError) as error:
        emit({'error': str(error) if not isinstance(error, OSError) else type(error).__name__})
        raise SystemExit(2)
