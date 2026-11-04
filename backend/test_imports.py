import asyncio
import hashlib
import io
import os
import unittest
import zipfile
from pathlib import Path
from unittest.mock import AsyncMock, patch
import httpx
from fastapi.testclient import TestClient
from openpyxl import Workbook
from parser import parse_report, localized_number, InvalidReport, MAX_BYTES
from clients import rpc, download, BackendUnavailable
import main
import worker

JOB = '11111111-1111-4111-8111-111111111111'
KEY = 'a' * 64


class ParserTests(unittest.TestCase):
    def test_actual_csv_bytes_with_arabic_digits_and_exact_catalog_match(self):
        data = 'كود الصنف,الكمية\nR1,٢٫٥\n'.encode('utf-8-sig')
        result = parse_report(data, 'items.csv', 'items', [{'id': 'raw', 'code': 'R1', 'name': 'بن'}])
        self.assertEqual(result['sha256'], hashlib.sha256(data).hexdigest())
        self.assertEqual(result['matches'], [{'itemId': 'raw', 'quantity': '2.5', 'requiresReview': False}])
        self.assertEqual(result['rowCount'], 1)

    def test_real_xlsx_bytes_preserve_zero_and_do_not_execute_formulas(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(['total', 'notes'])
        sheet.append([0, '=1+999'])
        stream = io.BytesIO()
        workbook.save(stream)
        result = parse_report(stream.getvalue(), 'money.xlsx', 'financial')
        self.assertEqual(result['rows'][0]['total'], 0)
        self.assertEqual(result['rows'][0]['notes'], '')

    def test_real_legacy_xls_bytes_from_an_independent_writer(self):
        data = (Path(__file__).parent / 'fixtures' / 'cashier-legacy.xls').read_bytes()
        result = parse_report(data, 'legacy.xls', 'items', [{'id':'raw','code':'R1'}])
        self.assertEqual(result['matches'][0]['itemId'], 'raw')
        self.assertEqual(result['matches'][0]['quantity'], '2.5')
        self.assertFalse(result['matches'][0]['requiresReview'])

    def test_titles_and_ambiguous_catalog_are_flagged(self):
        result = parse_report(b'Daily report\ncode,quantity\nR1,3', 'items.csv', 'items', [{'id': 'one', 'code': 'R1'}, {'id': 'two', 'code': 'R1'}])
        self.assertEqual(result['headerRow'], 2)
        self.assertIn('INTRO_ROWS_SKIPPED', result['warnings'])
        self.assertTrue(result['matches'][0]['requiresReview'])

    def test_decimal_normalization_does_not_turn_unknown_into_zero(self):
        for value, expected in [(0, '0'), ('١٬٢٣٤٫٥٠', '1234.50'), ('1,234.50', '1234.50'), ('12,50', '12.50'), ('(50)', '-50'), ('no', None), ('NaN', None), ('', None)]:
            with self.subTest(value=value):
                self.assertEqual(localized_number(value), expected)

    def test_formula_csv_is_text_and_flagged(self):
        result = parse_report(b'total,notes\n5,=1+1', 'money.csv', 'financial')
        self.assertEqual(result['rows'][0]['notes'], '=1+1')
        self.assertIn('FORMULA_TEXT_REQUIRES_REVIEW', result['warnings'])

    def test_malformed_oversized_ambiguous_and_wrong_formats_fail_closed(self):
        cases = [(b'', 'a.csv'), (b'x' * (MAX_BYTES + 1), 'a.csv'), (b'total,total\n1,2', 'a.csv'), (b'a\n1,2', 'a.csv'), (b'no', 'a.xlsx'), (b'no', 'a.xls'), (b'a\n1', 'a.exe'), (b'a,b\n"unterminated', 'a.csv'), (b'a\n\x00x', 'a.csv')]
        for data, name in cases:
            with self.subTest(name=name, length=len(data)), self.assertRaises(InvalidReport):
                parse_report(data, name, 'financial')

    def test_row_and_cell_limits(self):
        for data in [b'a\n' + b'1\n' * 10001, b'a\n' + b'x' * 2001, (','.join('c'+str(i) for i in range(101)) + '\n1').encode()]:
            with self.assertRaises(InvalidReport):
                parse_report(data, 'a.csv', 'financial')

    def test_zip_expansion_and_macros_rejected_before_parsing(self):
        for name, size in [('xl/vbaProject.bin', 10), ('xl/large.xml', 16 * 1024 * 1024)]:
            stream = io.BytesIO()
            with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as archive:
                archive.writestr(name, b'x' * size)
            with self.assertRaisesRegex(InvalidReport, 'WORKBOOK_EXPANSION_LIMIT'):
                parse_report(stream.getvalue(), 'a.xlsx', 'financial')


class ClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_publishable_key_is_never_misrepresented_as_a_jwt(self):
        requests = []
        def handle(request):
            requests.append(request)
            return httpx.Response(200, json={'ok': True})
        with patch.dict(os.environ, {'SUPABASE_URL': 'https://isolated.supabase.co', 'SUPABASE_PUBLISHABLE_KEY': 'sb_publishable_fixture'}):
            async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
                await rpc(client, 'bon_erp_claim_import', {})
                await rpc(client, 'bon_erp_read_import', {}, 'user-jwt-fixture')
        self.assertNotIn('Authorization', requests[0].headers)
        self.assertEqual(requests[1].headers['Authorization'], 'Bearer user-jwt-fixture')

    async def test_download_rejects_changed_size_without_leaking_url(self):
        with patch.dict(os.environ, {'SUPABASE_URL': 'https://isolated.supabase.co', 'SUPABASE_PUBLISHABLE_KEY': 'fixture'}):
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200, content=b'123'))) as client:
                with self.assertRaisesRegex(BackendUnavailable, '^IMPORT_FILE_SIZE_CHANGED$'):
                    await download(client, 'fixed/path.csv', 'secret-fixture', 4)


class PublisherTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)

    def test_health_and_authentication_and_request_bounds(self):
        self.assertEqual(self.client.get('/api/health').status_code, 200)
        self.assertEqual(self.client.get('/docs').status_code, 404)
        self.assertEqual(self.client.post(f'/api/imports/{JOB}/enqueue').status_code, 401)
        self.assertEqual(self.client.post(f'/api/imports/{JOB}/enqueue', content=b'x'*16385).status_code, 413)
        self.assertEqual(self.client.get('/api/health', headers={'content-length':'bad'}).status_code, 400)

    def test_publish_requires_database_authorization_and_does_not_forward_jwt(self):
        rpc_mock = AsyncMock(side_effect=[{'status':'uploading', 'object_path':f'{JOB}/{JOB}/report.csv'}, {'status':'queued','workerToken':KEY}])
        with patch.object(main, 'rpc', rpc_mock), patch.object(main, 'signed_download_token', AsyncMock(return_value='download-fixture')), patch.object(main, 'process_import', AsyncMock(return_value='done')) as send:
            response = self.client.post(f'/api/imports/{JOB}/enqueue', headers={'Authorization':'Bearer caller-fixture'})
            self.assertEqual(response.status_code, 202)
            payload = send.await_args.args[0].model_dump_json()
            self.assertNotIn('caller-fixture', payload)
            self.assertNotIn('download-fixture', payload)
            self.assertEqual(rpc_mock.await_args_list[0].args[3], 'caller-fixture')
        with patch.object(main, 'rpc', AsyncMock(side_effect=PermissionError())), patch.object(main, 'process_import', AsyncMock(return_value='done')) as send:
            self.assertEqual(self.client.post(f'/api/imports/{JOB}/enqueue',headers={'Authorization':'Bearer invalid'}).status_code,403)
            send.assert_not_awaited()

    def test_external_path_is_rejected_and_ready_job_is_not_republished(self):
        with patch.object(main, 'rpc', AsyncMock(return_value={'status':'uploading','object_path':'https://evil.test/file'})), patch.object(main, 'process_import', AsyncMock(return_value='done')) as send:
            self.assertEqual(self.client.post(f'/api/imports/{JOB}/enqueue',headers={'Authorization':'Bearer fixture'}).status_code,400)
            send.assert_not_awaited()
        with patch.object(main, 'rpc', AsyncMock(return_value={'status':'ready'})), patch.object(main, 'process_import', AsyncMock(return_value='done')) as send:
            self.assertEqual(self.client.post(f'/api/imports/{JOB}/enqueue',headers={'Authorization':'Bearer fixture'}).status_code,202)
            send.assert_not_awaited()

    def test_scheduled_endpoint_requires_one_valid_job_capability(self):
        self.assertEqual(self.client.post('/api/import-worker',json={'job_id':JOB,'worker_token':'bad'}).status_code,422)
        with patch.object(main,'process_import',AsyncMock(return_value='denied')):
            self.assertEqual(self.client.post('/api/import-worker',json={'job_id':JOB,'worker_token':KEY}).status_code,403)
        with patch.object(main,'process_import',AsyncMock(return_value='retry')):
            self.assertEqual(self.client.post('/api/import-worker',json={'job_id':JOB,'worker_token':KEY}).status_code,503)
        with patch.object(main,'process_import',AsyncMock(return_value='done')):
            self.assertEqual(self.client.post('/api/import-worker',json={'job_id':JOB,'worker_token':KEY}).status_code,200)


class WorkerTests(unittest.IsolatedAsyncioTestCase):
    async def test_processing_completes_pending_preview_only(self):
        calls = AsyncMock(side_effect=[{'path':'safe.csv','downloadToken':'fixture','bytes':7,'fileName':'safe.csv','kind':'financial','attempt':1}, {'status':'ready'}])
        with patch.object(worker,'rpc',calls), patch.object(worker,'download',AsyncMock(return_value=b'total\n5')):
            await worker.process_import(worker.ImportMessage(job_id=JOB,worker_token=KEY))
        self.assertEqual([c.args[1] for c in calls.await_args_list],['bon_erp_claim_import','bon_erp_finish_import'])
        self.assertEqual(calls.await_args_list[1].args[2]['p_result']['rows'],[{'total':'5'}])

    async def test_duplicate_delivery_is_idempotent_and_active_lease_is_respected(self):
        for job in [None, {'busy':True}]:
            with patch.object(worker,'rpc',AsyncMock(return_value=job)), patch.object(worker,'download',AsyncMock()) as download:
                if job:
                    self.assertEqual(await worker.process_import(worker.ImportMessage(job_id=JOB,worker_token=KEY)), 'busy')
                else:
                    await worker.process_import(worker.ImportMessage(job_id=JOB,worker_token=KEY))
                download.assert_not_awaited()

    async def test_parser_error_is_terminal_but_network_error_is_retryable(self):
        calls = AsyncMock(side_effect=[{'path':'safe.csv','downloadToken':'fixture','bytes':1,'fileName':'safe.csv','kind':'financial','attempt':1}, {'status':'failed'}])
        with patch.object(worker,'rpc',calls), patch.object(worker,'download',AsyncMock(return_value=b'x')):
            await worker.process_import(worker.ImportMessage(job_id=JOB,worker_token=KEY))
            self.assertEqual(calls.await_args_list[1].args[2]['p_error'],'EMPTY_REPORT')
        with patch.object(worker,'rpc',AsyncMock(side_effect=RuntimeError('network'))):
            self.assertEqual(await worker.process_import(worker.ImportMessage(job_id=JOB,worker_token=KEY)), 'retry')


if __name__ == '__main__':
    unittest.main()
