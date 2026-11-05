import importlib.util
import io
import json
import struct
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

source=Path(__file__).resolve().parents[1]/'meshy-town.py'
module=importlib.util.spec_from_file_location('meshy_town',source)
m=importlib.util.module_from_spec(module)
module.loader.exec_module(m)


class MeshyBatchTests(unittest.TestCase):
    def job(self, folder):
        views=[]
        for name in ('front','side','back'):
            path=folder/(name+'.png')
            path.write_bytes(b'test-input-'+name.encode())
            views.append(path)
        return {'stem':'TWN_STR_hall_A','views':views,'settings':{'ai_model':'meshy-7.1'},'viewOrder':['front','side','back']}

    def test_plan_excludes_five_scenes_and_orders_flat_inputs_front_first(self):
        jobs=m.inventory()
        self.assertEqual(len(jobs),45)
        self.assertFalse(any('SCN' in j['stem'] for j in jobs))
        floor=next(j for j in jobs if j['stem']=='TWN_FLR_cobble_A')
        self.assertEqual(floor['viewOrder'],['front','side','top'])
        self.assertEqual(floor['settings']['target_polycount'],600)
        self.assertEqual(jobs[0]['settings']['target_polycount'],6000)
        self.assertEqual(jobs[0]['settings']['texture_model'],'meshy-7')

    def test_successful_creation_is_not_billed_twice(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder=Path(temporary)
            job=self.job(folder)
            state=folder/'state.json'
            calls=[]
            old_root=m.ROOT
            m.ROOT=folder
            try:
                def request(*args):
                    calls.append(args)
                    return {'result':'task-123'}
                first=m.create_task(job,state,'never-logged-test-key',request)
                second=m.create_task(job,state,'never-logged-test-key',request)
            finally:
                m.ROOT=old_root
            self.assertEqual(len(calls),1)
            self.assertEqual(first['taskId'],second['taskId'])
            self.assertNotIn('never-logged-test-key',state.read_text())
            self.assertNotIn('data:image',state.read_text())

    def test_ambiguous_network_failure_is_never_resubmitted(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder=Path(temporary)
            job=self.job(folder)
            state=folder/'state.json'
            calls=[]
            old_root=m.ROOT
            m.ROOT=folder
            try:
                def request(*args):
                    calls.append(args)
                    raise TimeoutError('simulated lost response')
                with self.assertRaises(RuntimeError):
                    m.create_task(job,state,'test-key',request)
                restored=m.create_task(job,state,'test-key',request)
            finally:
                m.ROOT=old_root
            self.assertEqual(len(calls),1)
            self.assertEqual(restored['status'],'SUBMISSION_UNKNOWN')

    def test_explicit_rate_limit_can_be_retried(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder=Path(temporary)
            job=self.job(folder)
            state=folder/'state.json'
            old_root=m.ROOT
            m.ROOT=folder
            try:
                def reject(*args):
                    raise m.ApiError(429,12)
                rejected=m.create_task(job,state,'test-key',reject)
                accepted=m.create_task(job,state,'test-key',lambda *args:{'result':'task-456'})
            finally:
                m.ROOT=old_root
            self.assertEqual(rejected['status'],'RATE_LIMITED')
            self.assertEqual(accepted['taskId'],'task-456')

    def test_invalid_glb_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            path=Path(temporary)/'model.glb'
            path.write_bytes(b'not a valid downloaded glb')
            with self.assertRaises(ValueError):
                m.glb_info(path)

    def test_truncated_download_does_not_replace_an_existing_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            target=Path(temporary)/'model.glb'
            target.write_bytes(b'existing-original')
            response=io.BytesIO(b'partial')
            response.status=200
            response.headers={'Content-Length':'1000'}
            with patch.object(m.urllib.request,'urlopen',return_value=response):
                with self.assertRaisesRegex(ValueError,'Incomplete'):
                    m.download('https://assets.meshy.ai/fixture',target)
            self.assertEqual(target.read_bytes(),b'existing-original')

    def test_complete_download_is_validated_before_replacing_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            target=Path(temporary)/'model.glb'
            target.write_bytes(b'existing-original')
            response=io.BytesIO(b'corrupt')
            response.status=200
            response.headers={'Content-Length':'7'}
            with patch.object(m.urllib.request,'urlopen',return_value=response):
                with self.assertRaises(ValueError):
                    m.download('https://assets.meshy.ai/fixture',target,validator=m.glb_info)
            self.assertEqual(target.read_bytes(),b'existing-original')

    def test_embedded_textured_triangle_glb_can_be_counted(self):
        with tempfile.TemporaryDirectory() as temporary:
            path=Path(temporary)/'model.glb'
            binary=struct.pack('<9f3H',0,0,0,1,0,0,0,1,0,0,1,2)+b'\0\0'+b'PNG-test-fixture'
            document={'asset':{'version':'2.0'},'buffers':[{'byteLength':len(binary)}],'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':36},{'buffer':0,'byteOffset':36,'byteLength':6},{'buffer':0,'byteOffset':44,'byteLength':16}],'accessors':[{'bufferView':0,'componentType':5126,'type':'VEC3','count':3},{'bufferView':1,'componentType':5123,'type':'SCALAR','count':3}],'meshes':[{'primitives':[{'attributes':{'POSITION':0},'indices':1}]}],'images':[{'bufferView':2,'mimeType':'image/png'}],'materials':[{}]}
            binary+=b'\0'*((-len(binary))%4)
            payload=json.dumps(document).encode()
            payload+=b' '*((-len(payload))%4)
            length=12+8+len(payload)+8+len(binary)
            path.write_bytes(struct.pack('<4sII',b'glTF',2,length)+struct.pack('<II',len(payload),0x4e4f534a)+payload+struct.pack('<II',len(binary),0x004e4942)+binary)
            info=m.glb_info(path)
            self.assertEqual(info['triangles'],1)
            self.assertEqual(info['embeddedImages'],1)


if __name__=='__main__':
    unittest.main(verbosity=2)
