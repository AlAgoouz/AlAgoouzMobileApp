import hashlib
import io
import unittest
from pathlib import Path
from openpyxl import Workbook
from parser import parse_report,InvalidReport


def workbook(rows):
    book=Workbook();sheet=book.active
    for row in rows:sheet.append(row)
    out=io.BytesIO();book.save(out)
    return out.getvalue()


class BegunTests(unittest.TestCase):
    def test_independently_written_legacy_xls_with_print_layout(self):
        data=(Path(__file__).parent/'fixtures'/'sales-begun-synthetic.xls').read_bytes()
        result=parse_report(data,'sales.xls','financial',expected_date='2026-11-01')
        self.assertEqual(result['rows'],[dict(metric='Begun',amount='1234.50',businessDate='2026-11-01',sourceRow=4)])

    def test_printed_duplicate_line_uses_amount_once_not_receipt_count_or_other_totals(self):
        data=workbook([['System Sales Report (UWS)\nDate Range 01 11 26 - 01 11 26'],['Total Revenue 999.00\nTotal Revenue 999.00'],['Begun     58       1234.50\nBegun     58       1234.50'],['Grand Total 999999.00']])
        result=parse_report(data,'sales.xlsx','financial',expected_date='2026-11-01')
        self.assertEqual(result['rows'],[dict(metric='Begun',amount='1234.50',businessDate='2026-11-01',sourceRow=3)])
        self.assertEqual(result['sha256'],hashlib.sha256(data).hexdigest())

    def test_zero_is_confirmed_and_split_cells_and_vertical_column_are_supported(self):
        for rows in [[['Begun',0,0.0]],[['metric','amount'],['Begun','0.00']],[['Begun'],['0.00']]]:
            result=parse_report(workbook(rows),'sales.xlsx','financial')
            self.assertEqual(result['rows'][0]['amount'],'0.00')

    def test_never_falls_back_to_any_other_total_or_ignores_a_missing_amount(self):
        for rows,code in [([['Total Revenue 12.00'],['Grand Total 50000.00']],'BEGUN_NOT_FOUND'),([['Begun 58']],'BEGUN_AMOUNT_INVALID'),([['Begun 58 unknown']],'BEGUN_AMOUNT_INVALID'),([['Begun 58 -5.00']],'BEGUN_AMOUNT_INVALID'),([['Begun 58 1.001']],'BEGUN_AMOUNT_INVALID'),([['Begun 58 NaN']],'BEGUN_AMOUNT_INVALID')]:
            with self.subTest(rows=rows),self.assertRaisesRegex(InvalidReport,code):parse_report(workbook(rows),'sales.xlsx','financial')

    def test_repeated_metrics_in_different_cells_are_rejected_even_if_values_match(self):
        for second in ['Begun 58 1234.50','Begun 59 9999.00']:
            with self.assertRaisesRegex(InvalidReport,'BEGUN_AMBIGUOUS'):
                parse_report(workbook([['Begun 58 1234.50'],[second]]),'sales.xlsx','financial')

    def test_source_day_must_be_a_valid_single_day_and_match_the_upload_day(self):
        for header,expected,code in [('Date Range 01 11 26 - 02 11 26',None,'BEGUN_REPORT_DATE_INVALID'),('Date Range 31 02 26 - 31 02 26',None,'BEGUN_REPORT_DATE_INVALID'),('Date Range 01 11 26 - 01 11 26','2026-11-02','BEGUN_REPORT_DATE_MISMATCH')]:
            with self.subTest(header=header),self.assertRaisesRegex(InvalidReport,code):
                parse_report(workbook([[header],['Begun 58 1234.50']]),'sales.xlsx','financial',expected_date=expected)

    def test_source_row_survives_blank_print_layout_rows(self):
        result=parse_report(workbook([['System Sales Report'],[],[],['Begun 58 1234.50']]),'sales.xlsx','financial')
        self.assertEqual(result['rows'][0]['sourceRow'],4)


if __name__=='__main__':unittest.main()
