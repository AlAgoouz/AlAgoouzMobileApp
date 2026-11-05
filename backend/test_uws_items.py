import hashlib
import io
import unittest
from openpyxl import Workbook
from parser import parse_report,InvalidReport


def workbook(rows):
    book=Workbook();sheet=book.active
    for row in rows:sheet.append(row if isinstance(row,list) else [row])
    stream=io.BytesIO();book.save(stream);return stream.getvalue()


def line(text):return text+'\n'+text


def fixture():
    return ['Menu Item Sales Report (UWS)\nDate Range 01 11 26 - 01 11 26\nPrinted on 04/11/26 22:00:00',line('100010 Test Drink       4 33.33%'),line('40.00 14.55%'),line('200018 Test Beans       3 25.00%'),line('180.00 65.45%'),line('0.375 KG 21.43%'),line('300010 Test Blend       2 16.67%'),line('50.00 18.18%'),line('1.250 KG 71.43%'),line('300014 Test Seasoning   2 16.67%'),line('5.00 1.82%'),line('301003 Test Shade       1 8.33%'),line('0.00 0.00%'),line('0.125 KG 7.14%'),line('TOTAL SLS 12 275.00'),line('TOTAL OTHER DISC -5.00'),line('TOTAL NET SALES 270.00'),line('TOTAL WEIGHT 1.750 KG'),['Page No: 1/1','Report Template :','C:/fixture/report.rpt','Printed By','Fixture']]


class UwsItemsTests(unittest.TestCase):
    def parse(self,rows=None,date='2026-11-01',catalog=None):
        return parse_report(workbook(rows or fixture()),'arbitrary-filename-2030.xlsx','items',catalog,expected_date=date)

    def test_codes_counts_weight_and_single_day_are_preserved_without_double_counting(self):
        data=workbook(fixture());result=parse_report(data,'items.xlsx','items',expected_date='2026-11-01')
        self.assertEqual(result['sha256'],hashlib.sha256(data).hexdigest())
        self.assertEqual(result['rowCount'],4)
        self.assertEqual(result['businessDate'],'2026-11-01')
        self.assertEqual(result['rows'][0],dict(code='100010',name='Test Drink',quantity='4',unit='count',total='40.00',sourceFormat='uws-items-v1',businessDate='2026-11-01',sourceRow=2,saleCount=4))
        self.assertEqual((result['rows'][1]['quantity'],result['rows'][1]['saleCount'],result['rows'][1]['unit']),('0.375',3,'kg'))
        self.assertEqual(result['modifiers'],[dict(code='301003',name='Test Shade',saleCount=1,weightKg='0.125')])

    def test_missing_variant_and_seasoning_weights_cannot_be_interpreted_as_fixed_units(self):
        result=self.parse(catalog=[dict(id='blend',code='300010',name='Different Arabic Name'),dict(id='seasoning',code='300014',name='Seasoning')])
        self.assertEqual([r.get('sourceIssue') for r in result['rows']],[None,None,'UWS_VARIANT_WEIGHTS_REQUIRED','UWS_SEASONING_WEIGHT_REQUIRED'])
        self.assertTrue(result['matches'][2]['requiresReview']);self.assertTrue(result['matches'][3]['requiresReview'])
        self.assertIn('UWS_DETAILS_REQUIRED',result['warnings'])

    def test_repeated_codes_across_separate_cells_are_not_silently_deduplicated(self):
        rows=fixture();rows.insert(3,rows[1]);rows.insert(4,rows[2])
        with self.assertRaisesRegex(InvalidReport,'UWS_DUPLICATE_ITEM_CODE'):self.parse(rows)

    def test_date_is_internal_single_day_and_print_date_cannot_replace_it(self):
        with self.assertRaisesRegex(InvalidReport,'UWS_REPORT_DATE_MISMATCH'):self.parse(date='2026-11-04')
        for bad in ['Date Range 01 11 26 - 02 11 26','Date Range 31 02 26 - 31 02 26','Printed on 01/11/26 22:00:00']:
            rows=fixture();rows[0]='Menu Item Sales Report (UWS)\n'+bad
            with self.assertRaisesRegex(InvalidReport,'UWS_REPORT_DATE_INVALID'):self.parse(rows,date=None)

    def test_missing_details_corrupt_totals_and_unrecognized_lines_fail_closed(self):
        for index,replacement,code in [(2,None,'UWS_ITEM_AMOUNT_MISSING'),(14,line('TOTAL SLS 13 275.00'),'UWS_TOTALS_MISMATCH'),(17,line('TOTAL WEIGHT 1.875 KG'),'UWS_TOTALS_MISMATCH'),(5,line('0.000 KG 0.00%'),'UWS_NUMBER_INVALID'),(2,line('-40.00 14.55%'),'UWS_NUMBER_INVALID'),(12,line('1.00 0.00%'),'UWS_TOTALS_MISMATCH'),(2,'unrecognized item detail','UWS_UNRECOGNIZED_LINE')]:
            rows=fixture()
            if replacement is None:rows.pop(index)
            else:rows[index]=replacement
            with self.subTest(index=index,replacement=replacement),self.assertRaisesRegex(InvalidReport,code):self.parse(rows)

    def test_zero_price_does_not_automatically_turn_a_real_product_into_an_ignored_option(self):
        rows=['Menu Item Sales Report (UWS)\nDate Range 01 11 2026 - 01 11 2026',line('100099 Complimentary Water 2 100.00%'),line('0.00 0.00%'),line('TOTAL SLS 2 0.00')]
        result=self.parse(rows)
        self.assertEqual(result['rows'][0]['quantity'],'2');self.assertEqual(result['modifiers'],[])

    def test_modifier_weights_cannot_be_silently_dropped_without_a_known_parent(self):
        rows=fixture();del rows[6:9]
        rows[11]=line('TOTAL SLS 10 225.00');rows[14]=line('TOTAL WEIGHT 0.500 KG')
        with self.assertRaisesRegex(InvalidReport,'UWS_VARIANT_PARENT_REQUIRED'):self.parse(rows)


if __name__=='__main__':unittest.main()
