"""Bounded, non-executing file parsing. Financial approval stays in SQL."""
import csv
import hashlib
import io
import json
import math
import re
import unicodedata
import zipfile
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

MAX_BYTES = 10 * 1024 * 1024
MAX_ROWS = 10000
MAX_COLUMNS = 100
MAX_CELLS = 200000
MAX_RESULT = 2 * 1024 * 1024


class InvalidReport(ValueError):
    pass


def normalize(value):
    value = unicodedata.normalize("NFKC", str(value or "")).lower()
    value = re.sub("[أإآ]", "ا", value)
    return "".join(c for c in value if c.isalnum())


ALIASES = {
    "code": {normalize(v) for v in ["code", "barcode", "item code", "product code", "كود", "الكود", "باركود", "كود الصنف"]},
    "name": {normalize(v) for v in ["name", "item", "product", "item name", "product name", "اسم", "الصنف", "اسم الصنف", "المنتج", "اسم المنتج"]},
    "quantity": {normalize(v) for v in ["quantity", "qty", "count", "الكمية", "الكميه", "كمية", "عدد", "العدد"]},
}


def localized_number(value):
    text = unicodedata.normalize("NFKC", str(value if value is not None else "")).strip()
    text = "".join(str(unicodedata.digit(c)) if c.isdecimal() else c for c in text)
    text = re.sub(r"[\s\u200e\u200f]", "", text).replace("٬", "").replace("٫", ".")
    negative = text.startswith("(") and text.endswith(")")
    text = text.strip("()")
    if re.fullmatch(r"-?\d{1,3}(,\d{3})+(\.\d+)?", text):
        text = text.replace(",", "")
    elif re.fullmatch(r"-?\d+,\d{1,2}", text):
        text = text.replace(",", ".")
    if not re.fullmatch(r"[+-]?(\d+(\.\d*)?|\.\d+)", text):
        return None
    try:
        result = Decimal(text) * (-1 if negative else 1)
        return str(result) if result.is_finite() else None
    except InvalidOperation:
        return None


def cell_value(value):
    if value is None:
        return ""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, float) and not math.isfinite(value):
        raise InvalidReport("INVALID_NUMBER")
    if isinstance(value, str):
        if len(value) > 2000 or "\x00" in value:
            raise InvalidReport("CELL_TOO_LARGE")
        return value.strip()
    if isinstance(value, (int, float, bool)):
        return value
    return str(value)


def matrix_rows(data, extension):
    if extension == "csv":
        text = None
        for encoding in (["utf-16"] if data.startswith((b"\xff\xfe", b"\xfe\xff")) else ["utf-8-sig", "cp1256"]):
            try:
                text = data.decode(encoding)
                break
            except UnicodeError:
                continue
        if text is None or "\x00" in text:
            raise InvalidReport("INVALID_TEXT_ENCODING")
        try:
            dialect = csv.Sniffer().sniff(text[:8192], delimiters=",;\t|")
        except csv.Error:
            dialect = csv.excel
        yield from csv.reader(io.StringIO(text, newline=""), dialect=dialect, strict=True)
    elif extension == "xlsx":
        if not data.startswith(b"PK"):
            raise InvalidReport("INVALID_WORKBOOK")
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) > 1000 or sum(e.file_size for e in entries) > 25 * 1024 * 1024 or any(e.file_size > 15 * 1024 * 1024 or e.file_size > max(e.compress_size * 150, 1024 * 1024) or "vbaproject" in e.filename.lower() for e in entries):
                raise InvalidReport("WORKBOOK_EXPANSION_LIMIT")
        from openpyxl import load_workbook
        workbook = load_workbook(io.BytesIO(data), read_only=True, data_only=True, keep_links=False)
        try:
            sheet = workbook.worksheets[0]
            if sheet.max_column and sheet.max_column > MAX_COLUMNS or sheet.max_row and sheet.max_row > MAX_ROWS + 21:
                raise InvalidReport("REPORT_SIZE_LIMIT")
            yield from sheet.iter_rows(values_only=True)
        finally:
            workbook.close()
    elif extension == "xls":
        if not data.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
            raise InvalidReport("INVALID_WORKBOOK")
        import xlrd
        workbook = xlrd.open_workbook(file_contents=data, on_demand=True)
        try:
            sheet = workbook.sheet_by_index(0)
            if sheet.ncols > MAX_COLUMNS or sheet.nrows > MAX_ROWS + 21:
                raise InvalidReport("REPORT_SIZE_LIMIT")
            for index in range(sheet.nrows):
                yield sheet.row_values(index)
        finally:
            workbook.release_resources()
    else:
        raise InvalidReport("UNSUPPORTED_IMPORT_FORMAT")


def parse_report(data: bytes, filename: str, kind: str, catalog=None, expected_date=None):
    if not data or len(data) > MAX_BYTES:
        raise InvalidReport("REPORT_SIZE_LIMIT")
    extension = filename.rsplit(".", 1)[-1].lower()
    matrix, row_numbers, cells = [], [], 0
    try:
        for source_index,row in enumerate(matrix_rows(data, extension),1):
            row = [cell_value(value) for value in row]
            while row and row[-1] == "":
                row.pop()
            if not row:
                continue
            cells += len(row)
            if len(row) > MAX_COLUMNS or cells > MAX_CELLS or len(matrix) > MAX_ROWS + 20:
                raise InvalidReport("REPORT_SIZE_LIMIT")
            matrix.append(row)
            row_numbers.append(source_index)
    except InvalidReport:
        raise
    except Exception:
        raise InvalidReport("INVALID_WORKBOOK") from None
    if kind == 'financial':
        if not matrix:
            raise InvalidReport('EMPTY_REPORT')
        from financial_report import begun_report
        financial=begun_report(matrix,expected_date,InvalidReport,localized_number,row_numbers)
        return {'rows':[financial],'columns':list(financial),'rowCount':1,'headerRow':financial['sourceRow'],'sha256':hashlib.sha256(data).hexdigest(),'warnings':[],'matches':[]}
    if len(matrix) < 2:
        raise InvalidReport("EMPTY_REPORT")
    from uws_items import is_uws_items, parse_uws_items
    uws=parse_uws_items(matrix,row_numbers,expected_date,InvalidReport,localized_number) if kind=='items' and is_uws_items(matrix) else None
    header_index = 0
    if uws:
        rows=uws['rows'];columns=['code','name','quantity','unit','total']
    else:
        if kind == "items":
            for index, row in enumerate(matrix[:20]):
                labels = {normalize(value) for value in row}
                if labels & ALIASES["quantity"] and labels & (ALIASES["code"] | ALIASES["name"]):
                    header_index = index
                    break
        columns = [str(v) if str(v) else f"column_{i + 1}" for i, v in enumerate(matrix[header_index])]
        if any(len(c) > 120 for c in columns) or len({normalize(c) for c in columns}) != len(columns):
            raise InvalidReport("AMBIGUOUS_COLUMNS")
        rows = []
        for offset, values in enumerate(matrix[header_index + 1:], start=header_index + 1):
            if len(values) > len(columns):
                raise InvalidReport(f"ROW_COLUMNS_MISMATCH:{row_numbers[offset]}")
            rows.append({key: values[index] if index < len(values) else "" for index, key in enumerate(columns)})
    if not rows or len(rows) > MAX_ROWS:
        raise InvalidReport("REPORT_SIZE_LIMIT")
    warnings, matches = list(uws['warnings']) if uws else [], []
    if kind == "items" and catalog:
        code_column = next((c for c in columns if normalize(c) in ALIASES["code"]), None)
        name_column = next((c for c in columns if normalize(c) in ALIASES["name"]), None)
        quantity_column = next((c for c in columns if normalize(c) in ALIASES["quantity"]), None)
        by_code, by_name = {}, {}
        for item in catalog:
            by_code.setdefault(normalize(item.get("code")), []).append(item["id"])
            by_name.setdefault(normalize(item.get("name")), []).append(item["id"])
        for row in rows:
            code = normalize(row.get(code_column, "")) if code_column else ""
            name = normalize(row.get(name_column, "")) if name_column else ""
            candidates = by_code.get(code, []) if code else by_name.get(name, [])
            quantity = localized_number(row.get(quantity_column, "")) if quantity_column else None
            matches.append({"itemId": candidates[0] if len(candidates) == 1 else None, "quantity": quantity, "requiresReview": len(candidates) != 1 or quantity is None or Decimal(quantity) <= 0 or bool(row.get('sourceIssue'))})
        if any(m["requiresReview"] for m in matches):
            warnings.append("ITEMS_REQUIRE_REVIEW")
    if header_index:
        warnings.append("INTRO_ROWS_SKIPPED")
    if any(isinstance(value, str) and value.startswith("=") for row in rows for value in row.values()):
        warnings.append("FORMULA_TEXT_REQUIRES_REVIEW")
    result = {"rows": rows, "columns": columns, "rowCount": len(rows), "headerRow": header_index + 1, "sha256": hashlib.sha256(data).hexdigest(), "warnings": warnings, "matches": matches}
    if uws: result.update({key:uws[key] for key in ['businessDate','sourceFormat','modifiers']})
    if kind == 'items' and catalog:
        from suggestions import suggest_rows
        result['suggestions'] = suggest_rows(rows,columns,catalog,ALIASES,normalize)
    if len(json.dumps(result, ensure_ascii=False).encode("utf-8")) > MAX_RESULT:
        raise InvalidReport("REPORT_RESULT_TOO_LARGE")
    return result
