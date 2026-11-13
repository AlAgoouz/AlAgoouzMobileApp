"""Extract the single approved sales metric. No alternative totals or summing."""
import re
from datetime import date
from decimal import Decimal


def begun_report(matrix, expected_date, invalid, localized_number, row_numbers=None):
    candidates, periods = [], []
    for row_index, row in enumerate(matrix):
        for column, value in enumerate(row):
            lines = [line.strip() for line in str(value).splitlines() if line.strip()]
            # This export repeats a printed line inside the same cell. Repeated
            # occurrences in separate cells remain ambiguous and are rejected.
            if len(lines) == 2 and lines[0] == lines[1]:
                lines = lines[:1]
            for line in lines:
                if re.match(r'^Date Range\b', line, re.I):
                    match = re.fullmatch(r'Date Range\s+(\d{2})\s+(\d{2})\s+(\d{2}|\d{4})\s*-\s*(\d{2})\s+(\d{2})\s+(\d{2}|\d{4})', line, re.I)
                    try:
                        if not match: raise ValueError()
                        def day(parts):
                            d,m,y=map(int,parts)
                            return date(y+2000 if y<100 else y,m,d).isoformat()
                        start,end=day(match.groups()[:3]),day(match.groups()[3:])
                        if start!=end: raise ValueError()
                    except ValueError:
                        raise invalid('BEGUN_REPORT_DATE_INVALID') from None
                    periods.append(start)
                if not re.match(r'^Begun(?:\s|$)', line, re.I):
                    continue
                tail = line[5:].strip()
                extra = [str(v).strip() for v in row[column+1:] if str(v).strip()]
                if extra:
                    tail = ' '.join([tail,*extra]).strip()
                if not tail and row_index+1<len(matrix) and len(matrix[row_index+1])==1:
                    tail = str(matrix[row_index+1][0]).strip()
                tokens = tail.split()
                has_counter=len(tokens)==2 and re.fullmatch(r'\d+',tokens[0]) is not None
                if has_counter:
                    tokens=tokens[1:]  # The first number is the receipt count.
                if len(tokens)!=1:
                    raise invalid('BEGUN_AMOUNT_INVALID')
                if not re.search(r'[.,٫]\d{1,2}$',tokens[0]) and not (has_counter and re.fullmatch(r'\d+',tokens[0])):
                    # An isolated integer after Begun may be the receipt count
                    # with a missing amount. Never adopt that count as revenue.
                    raise invalid('BEGUN_AMOUNT_INVALID')
                parsed=localized_number(tokens[0])
                amount=Decimal(parsed) if parsed is not None else None
                if amount is None or amount<0 or amount.as_tuple().exponent < -2 or len(amount.as_tuple().digits)>15:
                    raise invalid('BEGUN_AMOUNT_INVALID')
                candidates.append((format(amount.quantize(Decimal('0.01')),'f'),row_numbers[row_index] if row_numbers else row_index+1))
    if not candidates:
        raise invalid('BEGUN_NOT_FOUND')
    if len(candidates)!=1:
        raise invalid('BEGUN_AMBIGUOUS')
    if len(set(periods))>1:
        raise invalid('BEGUN_REPORT_DATE_INVALID')
    business_date=periods[0] if periods else None
    if expected_date and business_date is None:
        raise invalid('BEGUN_REPORT_DATE_REQUIRED')
    if expected_date and expected_date!=business_date:
        raise invalid('BEGUN_REPORT_DATE_MISMATCH')
    amount,source_row=candidates[0]
    return {'metric':'Begun','amount':amount,'businessDate':business_date,'sourceRow':source_row}
