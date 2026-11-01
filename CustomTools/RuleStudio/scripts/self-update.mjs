// 「更新」按钮的服务端：从远端拉取当前分支并快进到最新。
//
// Safety: only fast-forwards. Local edits are never overwritten — a dirty file is accepted only when
// its content already equals the incoming version (for example, files copied over by hand to match
// the latest commit). Anything else stops the update and is reported to the player.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const run = promisify(execFile);

export async function git(cwd, args, { timeout = 60000 } = {}) {
  const { stdout } = await run('git', args, { cwd, timeout, maxBuffer: 16 << 20, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return stdout;
}
const tryGit = async (cwd, args) => { try { return { ok: true, out: await git(cwd, args) }; } catch (error) { return { ok: false, error }; } };

/** Paths that differ from HEAD in the working tree (tracked changes and untracked files). */
async function dirtyPaths(cwd) {
  const out = await git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const entries = out.split('\0').filter(Boolean), paths = [];
  for (let i = 0; i < entries.length; ++i) {
    const code = entries[i].slice(0, 2), file = entries[i].slice(3);
    if (code[0] === 'R' || code[0] === 'C') ++i; // the next entry is the rename source
    paths.push({ code, file });
  }
  return paths;
}

const blobAt = async (cwd, rev, file) => { const r = await tryGit(cwd, ['rev-parse', '--verify', '--quiet', `${rev}:${file}`]); return r.ok ? r.out.trim() : ''; };
const blobOf = async (cwd, file) => fs.existsSync(path.join(cwd, file)) ? (await git(cwd, ['hash-object', '--', file])).trim() : '';

/**
 * Fetch and fast-forward the current branch.
 * Returns { status: 'uptodate'|'updated'|'blocked'|'error', message, from, to, commits[], files[], restart }.
 */
export async function selfUpdate(cwd, { restartPaths = [] } = {}) {
  const top = (await tryGit(cwd, ['rev-parse', '--show-toplevel']));
  if (!top.ok) return { status: 'error', message: '当前目录不是 git 仓库，无法自动更新。' };
  const root = top.out.trim();
  const branch = (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  if (branch === 'HEAD') return { status: 'blocked', message: '当前不在任何分支上（detached HEAD），请先切回分支。' };
  const fetched = await tryGit(root, ['fetch', '--quiet', 'origin', branch]);
  if (!fetched.ok) return { status: 'error', message: `拉取失败：${String(fetched.error.stderr || fetched.error.message).trim().split('\n').pop()}` };
  const from = (await git(root, ['rev-parse', 'HEAD'])).trim(), to = (await git(root, ['rev-parse', 'FETCH_HEAD'])).trim();
  if (from === to) return { status: 'uptodate', message: '已经是最新版本。', from, to };
  let rewritten = false;
  if (!(await tryGit(root, ['merge-base', '--is-ancestor', 'HEAD', to])).ok) {
    // The remote history was rewritten (same content, new commit ids, e.g. authorship fixed):
    // allowed when the local HEAD's tree is identical to some commit on the remote branch.
    const tree = (await git(root, ['rev-parse', 'HEAD^{tree}'])).trim();
    const trees = (await git(root, ['log', '--format=%T', '-n', '400', to])).split('\n');
    if (!trees.includes(tree)) return { status: 'blocked', message: '本地有远端没有的提交，不能自动快进。请先推送或手动合并。', from, to };
    rewritten = true;
  }

  // Local edits: allow only content that some incoming commit already published (copied by hand
  // from the repo). Real local work is never overwritten.
  const changed = new Set((await git(root, ['diff', '--name-only', '--no-renames', from, to])).split('\n').filter(Boolean));
  const incomingCommits = (await git(root, ['rev-list', `${from}..${to}`])).split('\n').filter(Boolean);
  const conflicts = [], matching = [];
  for (const { code, file } of await dirtyPaths(root)) {
    const local = await blobOf(root, file);
    let published = false;
    for (const commit of incomingCommits) if (await blobAt(root, commit, file) === local) { published = true; break; }
    if (changed.has(file)) { if (published) matching.push({ code, file }); else conflicts.push(file); }
    // A hand-copied file that a later incoming commit deleted again: remove the stale copy.
    else if (code === '??' && published && !(await blobAt(root, to, file))) matching.push({ code, file });
    // Anything else is untouched by the update and left exactly as it is.
  }
  if (conflicts.length) return { status: 'blocked', message: `这些文件有本地修改，与最新版本不同，为避免覆盖已停止更新：${conflicts.slice(0, 8).join('、')}${conflicts.length > 8 ? ` 等 ${conflicts.length} 个` : ''}`, from, to };
  // Matching files: put them back to HEAD so the fast-forward can apply the identical content.
  for (const { code, file } of matching) {
    if (code === '??') fs.rmSync(path.join(root, file));
    else await git(root, ['checkout', 'HEAD', '--', file]);
  }

  const merged = await tryGit(root, rewritten ? ['reset', '--hard', '--quiet', to] : ['merge', '--ff-only', '--quiet', to]);
  if (!merged.ok) return { status: 'error', message: `快进失败：${String(merged.error.stderr || merged.error.message).trim().split('\n').pop()}`, from, to };
  const commits = (await git(root, ['log', '--format=%h %s', `${from}..${to}`])).split('\n').filter(Boolean);
  const files = [...changed];
  const restart = files.some(f => restartPaths.some(p => f.startsWith(p)));
  return { status: 'updated', message: `已更新 ${commits.length} 个提交。`, from, to, commits, files: files.length, restart };
}
