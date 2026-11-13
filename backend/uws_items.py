"""Read printed UWS item summaries without inventing variant or seasoning weights."""
import re
from datetime import date
from decimal import Decimal

FORMAT = 'uws-items-v1'
MODIFIERS = {'301001':'fath','301002':'wasst','301003':'ghamiq','301006':'arabica','301007':'robusta'}


def printed_lines(value):
    lines=[line.strip() for line in str(value).splitlines() if line.strip()]
    return lines[:1] if len(lines)==2 and lines[0]==lines[1] else lines


def report_date(matrix, invalid, expected_date=None):
    periods=[]
    for row in matrix:
        for value in row:
            for line in printed_lines(value):
                if not re.match(r'^Date Range\b',line,re.I): continue
                match=re.fullmatch(r'Date Range\s+(\d{2})\s+(\d{2})\s+(\d{2}|\d{4})\s*-\s*(\d{2})\s+(\d{2})\s+(\d{2}|\d{4})',line,re.I)
                try:
                    if not match: raise ValueError()
                    def day(parts):
                        d,m,y=map(int,parts)
                        return date(y+2000 if y<100 else y,m,d).isoformat()
                    start,end=day(match.groups()[:3]),day(match.groups()[3:])
                    if start!=end: raise ValueError()
                except ValueError:
                    raise invalid('UWS_REPORT_DATE_INVALID') from None
                periods.append(start)
    if not periods or len(set(periods))!=1: raise invalid('UWS_REPORT_DATE_INVALID')
    if expected_date and periods[0]!=expected_date: raise invalid('UWS_REPORT_DATE_MISMATCH')
    return periods[0]


def is_uws_items(matrix):
    return any(re.search(r'Menu\s+Item\s+Sales\s+Report\s*\(UWS\)',str(value),re.I) for row in matrix[:20] for value in row)


def parse_uws_items(matrix,row_numbers,expected_date,invalid,localized_number):
    business_date=report_date(matrix,invalid,expected_date)
    entries=[]; current=None; totals={}; codes=set()
    def number(value):
        parsed=localized_number(value)
        if parsed is None: raise invalid('UWS_NUMBER_INVALID')
        result=Decimal(parsed)
        if result<0 or result>Decimal('1000000000000'): raise invalid('UWS_NUMBER_INVALID')
        return result
    def finish():
        if current is not None:
            if 'amount' not in current: raise invalid('UWS_ITEM_AMOUNT_MISSING')
            entries.append(dict(current))
    for index,row in enumerate(matrix):
        if row and str(row[0]).strip().lower().startswith('page no:'): continue
        for value in row:
            for line in printed_lines(value):
                fields=line.rsplit(None,2)
                item=re.fullmatch(r'(\d{4,20})\s+(\S.*)',fields[0]) if len(fields)==3 else None
                if item and re.fullmatch(r'\d+(?:\.\d+)?',fields[1]) and re.fullmatch(r'\d+(?:\.\d+)?%',fields[2]):
                    finish()
                    code,name=item.groups()
                    count=fields[1]
                    if code in codes: raise invalid('UWS_DUPLICATE_ITEM_CODE')
                    codes.add(code); quantity=number(count)
                    if quantity<=0 or quantity!=quantity.to_integral_value(): raise invalid('UWS_NUMBER_INVALID')
                    current={'code':code,'name':name,'saleCount':int(quantity),'sourceRow':row_numbers[index]}
                    continue
                money=re.fullmatch(r'(-?[\d,]+\.\d{2})\s+\d+(?:\.\d+)?%',line)
                weight=re.fullmatch(r'([\d,]+(?:\.\d+)?)\s+KG\s+\d+(?:\.\d+)?%',line,re.I)
                if money or weight:
                    if current is None: raise invalid('UWS_ORPHAN_DETAIL')
                    key='amount' if money else 'weight'
                    if key in current: raise invalid('UWS_DUPLICATE_DETAIL')
                    current[key]=number((money or weight).group(1))
                    if key=='weight' and current[key]<=0: raise invalid('UWS_NUMBER_INVALID')
                    continue
                sales=re.fullmatch(r'TOTAL SLS\s+(\d+)\s+([\d,]+\.\d{2})',line,re.I)
                weight_total=re.fullmatch(r'TOTAL WEIGHT\s+([\d,]+(?:\.\d+)?)\s+KG',line,re.I)
                if sales or weight_total:
                    finish();current=None
                    key='sales' if sales else 'weight'
                    if key in totals: raise invalid('UWS_DUPLICATE_TOTAL')
                    totals[key]=(number(sales.group(1)),number(sales.group(2))) if sales else number(weight_total.group(1))
                    continue
                if re.match(r'^(Menu\s+Item\s+Sales\s+Report|Item\s|Revenue Center\s|Time Period\s|PC\s|Employee\s|Transaction Type\s|Sales Type\s|Date Range\s|Printed on\s|Printed By\s|TOTAL ITEMS DISC\s|TOTAL OTHER DISC\s|TOTAL NET SALES\s|-+$)',line,re.I): continue
                raise invalid('UWS_UNRECOGNIZED_LINE')
    finish()
    if not entries or 'sales' not in totals: raise invalid('UWS_TOTALS_MISSING')
    if totals['sales']!=(sum(e['saleCount'] for e in entries),sum(e['amount'] for e in entries)):
        raise invalid('UWS_TOTALS_MISMATCH')
    weighted=sum(e.get('weight',Decimal(0)) for e in entries)
    if weighted and totals.get('weight')!=weighted: raise invalid('UWS_TOTALS_MISMATCH')
    modifiers=[]; products=[]
    for entry in entries:
        if entry['code'] in MODIFIERS:
            if entry['amount']!=0: raise invalid('UWS_MODIFIER_AMOUNT_INVALID')
            modifiers.append({'code':entry['code'],'name':entry['name'],'saleCount':entry['saleCount'],**({'weightKg':str(entry['weight'])} if 'weight' in entry else {})})
        else: products.append(entry)
    if modifiers and not any(e['code']=='300010' for e in products): raise invalid('UWS_VARIANT_PARENT_REQUIRED')
    rows=[]
    for entry in products:
        issue=None
        if entry['code']=='300010' and modifiers: issue='UWS_VARIANT_WEIGHTS_REQUIRED'
        if entry['code']=='300014' and 'weight' not in entry: issue='UWS_SEASONING_WEIGHT_REQUIRED'
        rows.append({'code':entry['code'],'name':entry['name'],'quantity':str(entry.get('weight',entry['saleCount'])),'unit':'kg' if 'weight' in entry else 'count','total':str(entry['amount']),'sourceFormat':FORMAT,'businessDate':business_date,'sourceRow':entry['sourceRow'],'saleCount':entry['saleCount'],**({'sourceIssue':issue} if issue else {})})
    if not rows: raise invalid('UWS_NO_PRODUCTS')
    return {'rows':rows,'businessDate':business_date,'sourceFormat':FORMAT,'modifiers':modifiers,'warnings':['UWS_DETAILS_REQUIRED'] if any(r.get('sourceIssue') for r in rows) else []}
