"""Read-only report preparation. Decimal math is reconciled to the SQL totals."""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from io import BytesIO
from typing import Annotated
import polars as pl
import pandera.polars as pa
from pydantic import Field, TypeAdapter
import xlsxwriter

D=pl.Decimal(30,6)
categories={'raw_bean':'بن خام','raw_spice':'منتج مباشر','manufactured_blend':'توليفات','direct_product':'منتج مباشر','drink_recipe':'مشروبات لها وصفة','direct_drink':'مشروبات بيع مباشر','seasoning_recipe':'تحويجات','snack':'سناكس'}
units={'kg':'كيلو','gram':'جرام','piece':'قطعة','count':'عدد','liter':'لتر','ml':'مل'}
channels={'wholesale':'جملة','retail':'بيع المحل السابق','cashier_sync':'يوم الكاشير'}
money_adapter=TypeAdapter(Annotated[Decimal,Field(allow_inf_nan=False,max_digits=24,decimal_places=6)])
text_adapter=TypeAdapter(Annotated[str,Field(max_length=2000)])
date_adapter=TypeAdapter(date)
sales_schema=pa.DataFrameSchema({
    'id':pa.Column(str,unique=True),'number':pa.Column(str),'date':pa.Column(str),
    'customer':pa.Column(str),'channel':pa.Column(str),
    'amount':pa.Column(D,checks=pa.Check.ge(0)),
    'cost':pa.Column(D,checks=pa.Check.ge(0)),'net':pa.Column(D),
},strict=True)
expense_schema=pa.DataFrameSchema({'id':pa.Column(str,unique=True),'date':pa.Column(str),'title':pa.Column(str),'category':pa.Column(str),'amount':pa.Column(D,checks=pa.Check.ge(0))},strict=True)


def number(row,key,optional=False,nonnegative=False):
    if optional and row.get(key) is None:
        return None
    value=money_adapter.validate_python(row[key])
    if nonnegative and value<0:
        raise ValueError('INVALID_REPORT_VALUE')
    return value


def text(row,key,optional=False):
    if optional and row.get(key) is None:
        return ''
    return text_adapter.validate_python(row[key],strict=True)


def business_day(row):
    return date_adapter.validate_python(row['date']).isoformat()


def records(source,key):
    rows=source[key]
    if not isinstance(rows,list) or len(rows)>10000 or any(not isinstance(r,dict) for r in rows):
        raise ValueError('EXPORT_ROW_LIMIT')
    return rows


@dataclass
class Report:
    source:dict
    summary:dict
    sales:list
    expenses:list
    daily:list
    from_date:str
    to_date:str


def prepare_report(source,summary,from_date,to_date):
    sales,expenses=[],[]
    for row in records(source,'sales_invoices'):
        day=business_day(row)
        if row.get('isReturned') or not from_date<=day<=to_date:
            continue
        sales.append(dict(id='invoice:'+text(row,'id'),number=text(row,'invoiceNumber'),date=day,customer=text(row,'customerName'),channel=text(row,'saleType'),amount=number(row,'totalAmount',nonnegative=True),cost=number(row,'totalCost',nonnegative=True),net=number(row,'netProfit')))
    for row in records(source,'cashier_days'):
        day=business_day(row)
        if row['status']!='approved' or not from_date<=day<=to_date:
            continue
        amount=number(row['financialReport'],'totalRevenue',nonnegative=True)
        cost=number(row,'totalCost',nonnegative=True)
        sales.append(dict(id='day:'+text(row,'id'),number='DAY-'+day,date=day,customer='يوم كاشير معتمد',channel='cashier_sync',amount=amount,cost=cost,net=amount-cost))
    for row in records(source,'expenses'):
        day=business_day(row)
        if row.get('isCancelled') or row['category']=='مسحوبات شركاء' or not from_date<=day<=to_date:
            continue
        expenses.append(dict(id=text(row,'id'),date=day,title=text(row,'title'),category=text(row,'category'),amount=number(row,'amount',nonnegative=True)))
    frame=sales_schema.validate(pl.DataFrame(sales,schema={'id':pl.String,'number':pl.String,'date':pl.String,'customer':pl.String,'channel':pl.String,'amount':D,'cost':D,'net':D}))
    spending=expense_schema.validate(pl.DataFrame(expenses,schema={'id':pl.String,'date':pl.String,'title':pl.String,'category':pl.String,'amount':D}))
    totals=frame.select(pl.col('amount').sum(),pl.col('cost').sum(),pl.col('net').sum()).row(0)
    spent=spending.select(pl.col('amount').sum()).item()
    actual={'revenue':totals[0],'cost':totals[1],'gross':totals[2],'spent':spent,'net':totals[2]-spent}
    if source['version']!=summary['version'] or summary['report']['count']!=len(sales):
        raise ValueError('EXPORT_SNAPSHOT_MISMATCH')
    for key,value in actual.items():
        if abs(value-number(summary['report'],key))>Decimal('0.000001'):
            raise ValueError('EXPORT_TOTAL_MISMATCH')
    daily=frame.select('date',pl.col('amount').alias('sales'),pl.col('net').alias('profit')).vstack(spending.select('date',pl.lit(Decimal(0),dtype=D).alias('sales'),(-pl.col('amount')).alias('profit'))).group_by('date').agg(pl.col('sales').sum(),pl.col('profit').sum()).sort('date').to_dicts()
    return Report(source,summary,sales,expenses,daily,from_date,to_date)


def workbook_bytes(report):
    output=BytesIO()
    book=xlsxwriter.Workbook(output,{'in_memory':True,'strings_to_formulas':False,'strings_to_urls':False})
    header=book.add_format({'bold':True,'bg_color':'#352719','font_color':'#FFFFFF','font_name':'Arial','align':'right','reading_order':2})
    normal=book.add_format({'font_name':'Arial','reading_order':2,'valign':'top'})
    numeric=book.add_format({'font_name':'Arial','num_format':'#,##0.00;[Red]-#,##0.00','reading_order':1})
    quantity=book.add_format({'font_name':'Arial','num_format':'#,##0.######;[Red]-#,##0.######','reading_order':1})
    def sheet(name,columns,rows,quantity_columns=()):
        if len(rows)>10000:
            raise ValueError('EXPORT_ROW_LIMIT')
        page=book.add_worksheet(name)
        page.right_to_left();page.freeze_panes(1,0);page.set_landscape();page.fit_to_pages(1,0)
        page.set_column(0,len(columns)-1,24)
        for col,label in enumerate(columns):page.write_string(0,col,label,header)
        for row,values in enumerate(rows,1):
            for col,value in enumerate(values):
                if value is None:page.write_blank(row,col,None,normal)
                elif isinstance(value,(Decimal,int,float)) and not isinstance(value,bool):page.write_number(row,col,float(value),quantity if col in quantity_columns else numeric)
                else:page.write_string(row,col,str(value),normal)
        if rows:page.autofilter(0,0,len(rows),len(columns)-1)
        page.repeat_rows(0);page.set_footer('&Cبُن العجوز — &P / &N')
        return page
    labels={'revenue':'المبيعات المسجلة','cost':'تكلفة البضاعة','gross':'مجمل الربح','spent':'مصروفات التشغيل','net':'صافي الربح'}
    sheet('ملخص الفترة',['البيان','القيمة'],[['من',report.from_date],['إلى',report.to_date],['إصدار البيانات',report.source['version']]]+[[label,number(report.summary['report'],key)] for key,label in labels.items()]+[['ملاحظة','المبيعات تستبعد المرتجعات وتضم أيام الكاشير المعتمدة مرة واحدة.'],['الأرصدة','المخزون والعملاء والموردون والشركاء أرصدة حالية.']])
    sheet('المبيعات',['المستند','التاريخ','العميل','القناة','المبيعات','التكلفة','مجمل الربح'],[[r['number'],r['date'],r['customer'],channels.get(r['channel'],r['channel']),r['amount'],r['cost'],r['net']] for r in report.sales])
    sheet('المصروفات',['التاريخ','البيان','التصنيف','المبلغ'],[[r[k] for k in ['date','title','category','amount']] for r in report.expenses])
    daily=sheet('الأيام المسجلة',['التاريخ','المبيعات','الصافي'],[[r['date'],r['sales'],r['profit']] for r in report.daily])
    if report.daily:
        chart=book.add_chart({'type':'line'})
        for col,title in [(1,'المبيعات'),(2,'الصافي')]:chart.add_series({'name':title,'categories':['الأيام المسجلة',1,0,len(report.daily),0],'values':['الأيام المسجلة',1,col,len(report.daily),col]})
        chart.set_title({'name':'المبيعات وصافي الربح للأيام المسجلة'});daily.insert_chart('E2',chart)
    sheet('المخزون الحالي',['الكود','الصنف','النوع','الوحدة','الرصيد','متوسط التكلفة','قيمة الرصيد'],[[text(r,'code'),text(r,'name'),categories.get(text(r,'category'),text(r,'category')),units.get(text(r,'baseUnit'),text(r,'baseUnit')),number(r,'stock'),number(r,'costPrice',nonnegative=True),number(r,'stock')*number(r,'costPrice')] for r in records(report.source,'items') if r['category'] not in ('drink_recipe','seasoning_recipe')],quantity_columns=(4,))
    sheet('العملاء',['العميل','الهاتف','المنطقة','المديونية الحالية','إجمالي المبيعات المسجل'],[[text(r,'name'),text(r,'phone',True),text(r,'area',True),number(r,'balance'),number(r,'totalSales')] for r in records(report.source,'customers')])
    sheet('الموردون',['المورد','الهاتف','العنوان','المندوب','إجمالي المشتريات المسجل'],[[text(r,'name'),text(r,'phone',True),text(r,'address',True),text(r,'representativeName',True),number(r,'totalPurchases')] for r in records(report.source,'suppliers')])
    sheet('المشتريات',['الفاتورة','التاريخ','المورد','الصافي دون الضريبة','الضريبة المنفصلة','الإجمالي','الحالة'],[[text(r,'invoiceNumber'),business_day(r),text(r,'supplierName'),number(r,'netAmount',True),number(r,'taxAmount',True),number(r,'totalAmount'),'ملغاة' if r.get('isCancelled') else 'معتمدة'] for r in records(report.source,'purchase_invoices')])
    sheet('حصص الشركاء',['الشريك','النسبة %','حصة ربح الفترة فقط','المدفوع من الجيب حاليًا','المسحوبات حاليًا'],[[text(r,'name'),number(r,'sharePercent'),number(report.summary['report'],'net')*number(r,'sharePercent')/100,number(r,'totalPaidFromPocket'),number(r,'totalWithdrawals')] for r in records(report.source,'partners')])
    openings=records(report.source,'financial_openings') if 'financial_openings' in report.source else []
    if len(openings)>1:raise ValueError('INVALID_FINANCIAL_OPENING')
    if openings:
        r=openings[0]
        sheet('بداية المدة',['تاريخ بداية التشغيل','مكان الرصيد','الرصيد الافتتاحي الحالي','المعالجة'],[[business_day(r),'خزنة الشركة',number(r,'amount',nonnegative=True),'رصيد مرحّل مستقل عن المبيعات والأرباح وحصص الشركاء']])
    book.close()
    data=output.getvalue()
    if len(data)>8*1024*1024:raise ValueError('EXPORT_SIZE_LIMIT')
    return data
