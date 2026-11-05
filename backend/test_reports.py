import copy
import io
import os
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from hypothesis import given, settings, strategies as st
from openpyxl import load_workbook
from parser import parse_report, localized_number
from reporting import prepare_report, workbook_bytes
import main


def fixture():
    invoice = dict(id='sale', invoiceNumber='INV-1', date='2026-11-04', customerName='عميل القاهرة', saleType='wholesale', totalAmount=Decimal('12.34'), totalCost=Decimal('2.11'), netProfit=Decimal('10.23'))
    source = dict(version=7, sales_invoices=[invoice, dict(invoice, id='returned', isReturned=True)], cashier_days=[dict(id='day', date='2026-11-04', status='approved', financialReport={'totalRevenue':Decimal('5.01')}, totalCost=Decimal('1.01')), dict(id='pending', date='2026-11-04', status='pending')], expenses=[dict(id='expense', date='2026-11-04', title='كهرباء', category='إيجار', amount=Decimal('0.10')), dict(id='cancelled', date='2026-11-04', title='ملغي', category='إيجار', amount=999, isCancelled=True), dict(id='personal', date='2026-11-04', title='مسحوبات', category='مسحوبات شركاء', amount=999)], items=[dict(code='B1', name='=HYPERLINK("https://invalid.test")', category='raw_bean', baseUnit='kg', stock=Decimal('-0.125'), costPrice=Decimal('11.11'))], customers=[dict(name='عميل القاهرة', phone='01012345678', area='القاهرة', balance=4, totalSales=12)], suppliers=[dict(name='المورد', phone='01123456789', address='القاهرة', representativeName='أحمد', totalPurchases=7)], partners=[dict(name='المالك', sharePercent=100, totalPaidFromPocket=2, totalWithdrawals=1)], purchase_invoices=[dict(invoiceNumber='OLD-1', date='2026-11-04', supplierName='المورد', totalAmount=7)])
    summary = dict(version=7, report=dict(count=2, revenue=Decimal('17.35'), cost=Decimal('3.12'), gross=Decimal('14.23'), spent=Decimal('0.10'), net=Decimal('14.13')))
    return source, summary


class ReportTests(unittest.TestCase):
    def test_count_unit_is_preserved_in_inventory_excel(self):
        source, summary = fixture()
        source['items'][0]['baseUnit']='count'
        book=load_workbook(io.BytesIO(workbook_bytes(prepare_report(source,summary,'2026-11-01','2026-11-30'))))
        self.assertEqual(book['المخزون الحالي']['D2'].value,'عدد')

    def test_opening_cash_is_exported_separately_without_changing_profit(self):
        source,summary=fixture()
        source['financial_openings']=[dict(id='opening',date='2026-11-01',account='treasury',amount=Decimal('1234.50'))]
        report=prepare_report(source,summary,'2026-11-01','2026-11-30')
        book=load_workbook(io.BytesIO(workbook_bytes(report)))
        self.assertEqual(len(book.sheetnames),10)
        self.assertEqual(book['بداية المدة']['C2'].value,1234.5)
        self.assertEqual(book['حصص الشركاء']['C2'].value,14.13)
        self.assertEqual(report.summary['report']['net'],Decimal('14.13'))

    def test_decimal_totals_reconcile_and_invalid_snapshots_fail_closed(self):
        source, summary = fixture()
        report = prepare_report(source, summary, '2026-11-01', '2026-11-30')
        self.assertEqual(report.daily, [dict(date='2026-11-04', sales=Decimal('17.350000'), profit=Decimal('14.130000'))])
        self.assertEqual(len(report.sales), 2)
        for mutation in [lambda s: s['report'].update(net=Decimal('14.14')), lambda s: s.update(version=8), lambda s: s['report'].update(count=3)]:
            wrong = copy.deepcopy(summary); mutation(wrong)
            with self.assertRaises(ValueError): prepare_report(source, wrong, '2026-11-01', '2026-11-30')
        source['sales_invoices'].append(source['sales_invoices'][0])
        with self.assertRaises(Exception): prepare_report(source, summary, '2026-11-01', '2026-11-30')

    def test_empty_period_is_valid_and_missing_financial_value_is_not_zero(self):
        source, summary = fixture()
        for key in ['sales_invoices','cashier_days','expenses']: source[key]=[]
        summary['report']={key:0 for key in ['count','revenue','cost','gross','spent','net']}
        self.assertEqual(prepare_report(source, summary, '2026-11-01', '2026-11-30').daily, [])
        source, summary = fixture(); del source['sales_invoices'][0]['totalCost']
        with self.assertRaises(KeyError): prepare_report(source, summary, '2026-11-01', '2026-11-30')

    def test_actual_excel_rtl_chart_numbers_injection_and_legacy_unknowns(self):
        report=prepare_report(*fixture(), '2026-11-01', '2026-11-30')
        data=workbook_bytes(report)
        book=load_workbook(io.BytesIO(data))
        self.assertEqual(len(book.sheetnames),9)
        self.assertTrue(all(page.sheet_view.rightToLeft for page in book))
        self.assertEqual(book['المبيعات']['E2'].value,12.34)
        self.assertEqual(book['المخزون الحالي']['B2'].data_type,'s')
        self.assertTrue(book['المخزون الحالي']['B2'].value.startswith('=HYPERLINK'))
        self.assertEqual(book['المخزون الحالي']['E2'].value,-0.125)
        self.assertIsNone(book['المشتريات']['D2'].value)
        self.assertIsNone(book['المشتريات']['E2'].value)
        self.assertEqual(len(book['الأيام المسجلة']._charts),1)
        self.assertEqual(book['حصص الشركاء']['C2'].value,14.13)

    def test_arabic_pdf_and_multipage_invoice_use_fixed_local_resources(self):
        from pdf_reports import initialize_pdf, report_pdf, invoice_pdf
        try: initialize_pdf()
        except (OSError,ImportError):
            if os.environ.get('AGOUZ_PDF_REQUIRED')=='1': raise
            self.skipTest('Native PDF libraries tested in Linux CI and deployment')
        from pypdf import PdfReader
        report=prepare_report(*fixture(),'2026-11-01','2026-11-30')
        data=report_pdf(report)
        self.assertTrue(data.startswith(b'%PDF-'))
        reader=PdfReader(io.BytesIO(data))
        self.assertEqual(len(reader.pages),1)
        font_names=[str(value.get_object().get('/BaseFont')) for value in reader.pages[0]['/Resources']['/Font'].get_object().values()]
        self.assertTrue(any('Agouz' in name or 'Amiri' in name for name in font_names),font_names)
        invoice=dict(invoiceNumber='INV-AR-1',date='2026-11-04',customerName='شركة بن العجوز للتجارة — القاهرة',customerPhone='01012345678',subtotal=100,discount=0,totalAmount=100,paidAmount=40,remainingAmount=60,items=[dict(itemName='توليفة العجوز الخاصة رقم '+str(i),quantity=1,unitLabel='كيلو',unitPrice=1,totalPrice=1) for i in range(100)])
        receipt=invoice_pdf(invoice)
        self.assertGreater(len(PdfReader(io.BytesIO(receipt)).pages),1)
        folder=Path(__file__).resolve().parents[1]/'tmp'/'report-examples'; folder.mkdir(parents=True,exist_ok=True)
        (folder/'Agouz-report-ar.pdf').write_bytes(data)
        (folder/'Agouz-invoice-ar.pdf').write_bytes(receipt)
        (folder/'Agouz-report-ar.xlsx').write_bytes(workbook_bytes(report))


class GeneratedTests(unittest.TestCase):
    @settings(max_examples=80,deadline=None,database=None)
    @given(st.integers(min_value=-999999999,max_value=999999999),st.integers(min_value=0,max_value=99))
    def test_arabic_decimal_roundtrip_is_exact(self,whole,cents):
        original=f'{whole}.{cents:02}'
        arabic=original.translate(str.maketrans('0123456789.','٠١٢٣٤٥٦٧٨٩٫'))
        self.assertEqual(Decimal(localized_number(arabic)),Decimal(original))

    @settings(max_examples=60,deadline=None,database=None)
    @given(st.text(alphabet='abcdefغرز',min_size=1,max_size=30))
    def test_unknown_money_never_becomes_confirmed_zero(self,value):
        self.assertIsNone(localized_number(value))

    @settings(max_examples=40,deadline=None,database=None)
    @given(st.integers(min_value=1,max_value=10000))
    def test_suggestions_do_not_rewrite_source_or_approve_fuzzy_rows(self,quantity):
        data=f'name,quantity\nبن العجوزز,{quantity}'.encode()
        result=parse_report(data,'cashier.csv','items',[dict(id='one',code='B1',name='بن العجوز'),dict(id='two',code='B2',name='بن العجوز الخاص')])
        self.assertEqual(result['rows'][0]['name'],'بن العجوزز')
        self.assertTrue(result['matches'][0]['requiresReview'])
        self.assertIsNone(result['matches'][0].get('itemId'))
        self.assertEqual(result['suggestions'][0]['candidates'][0]['itemId'],'one')
        self.assertEqual(len(result['suggestions'][0]['candidates']),2)


class ExportApiTests(unittest.TestCase):
    def setUp(self): self.client=TestClient(main.app)

    def test_authentication_precedes_generation_and_exports_are_private(self):
        with patch('report_source.report_source',AsyncMock(return_value=fixture())) as source:
            self.assertEqual(self.client.get('/api/reports/xlsx?from_date=2026-11-01&to_date=2026-11-30').status_code,401)
            source.assert_not_awaited()
            result=self.client.get('/api/reports/xlsx?from_date=2026-11-01&to_date=2026-11-30',headers={'Authorization':'Bearer caller-test'})
            self.assertEqual(result.status_code,200)
            self.assertEqual(result.headers['cache-control'],'no-store')
            self.assertTrue(result.content.startswith(b'PK'))
            self.assertEqual(source.await_args.args[1],'caller-test')

    def test_denial_mismatch_and_missing_invoice_never_return_file(self):
        headers={'Authorization':'Bearer caller-test'}
        for exception,status in [(PermissionError(),403),(ValueError('private-data'),503)]:
            with patch('report_source.report_source',AsyncMock(side_effect=exception)):
                response=self.client.get('/api/reports/pdf?from_date=2026-11-01&to_date=2026-11-30',headers=headers)
                self.assertEqual(response.status_code,status)
                self.assertNotIn('private-data',response.text)
        with patch.object(main,'rpc',AsyncMock(return_value=None)):
            self.assertEqual(self.client.get('/api/invoices/missing/pdf',headers=headers).status_code,404)
        self.assertEqual(self.client.get('/api/reports/xlsx?from_date=2026-11-30&to_date=2026-11-01',headers=headers).status_code,400)


if __name__=='__main__': unittest.main()
