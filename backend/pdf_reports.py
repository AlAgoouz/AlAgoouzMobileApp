import ctypes
import hashlib
import html
import io
import contextlib
from pathlib import Path
from threading import Lock
from decimal import Decimal

_lock=Lock()
_libraries=[]
_ready=False


def initialize_pdf():
    global _ready
    with _lock:
        if _ready:return
        root=Path(__file__).parent/'native'
        if (root/'SHA256SUMS').exists():
            for line in (root/'SHA256SUMS').read_text().splitlines():
                digest,name=line.split()
                path=root/name
                if path.resolve().parent!=root.resolve() or hashlib.sha256(path.read_bytes()).hexdigest()!=digest:
                    raise RuntimeError('PDF_NATIVE_INTEGRITY_FAILED')
            for name in ['libfontconfig.so.1','libharfbuzz.so.0','libharfbuzz-subset.so.0','libgobject-2.0.so.0','libpango-1.0.so.0','libpangoft2-1.0.so.0']:
                _libraries.append(ctypes.CDLL(str(root/name),mode=ctypes.RTLD_GLOBAL))
        # Native import failures contain environment diagnostics, never report data.
        with contextlib.redirect_stderr(io.StringIO()):
            from weasyprint import HTML
        _ready=True


def pdf_bytes(title,period,sections):
    initialize_pdf()
    from weasyprint import HTML
    from weasyprint.text.fonts import FontConfiguration
    font=(Path(__file__).parent/'assets'/'Amiri-Regular.ttf').read_bytes()
    def fetch(url,*args,**kwargs):
        if url!='agouz-font:amiri':raise ValueError('PDF_RESOURCE_DENIED')
        return {'string':font,'mime_type':'font/ttf'}
    escape=lambda v:html.escape(str(v),quote=True)
    parts=[]
    for heading,columns,rows in sections:
        if len(rows)>1000:raise ValueError('PDF_ROW_LIMIT')
        content=''.join('<tr>'+''.join('<td>'+escape(f'{v:,.2f}' if isinstance(v,Decimal) else v)+'</td>' for v in row)+'</tr>' for row in rows)
        parts.append('<h2>'+escape(heading)+'</h2><table><thead><tr>'+''.join('<th>'+escape(c)+'</th>' for c in columns)+'</tr></thead><tbody>'+content+'</tbody></table>')
    markup='''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
    @font-face{font-family:Agouz;src:url('agouz-font:amiri')}@page{size:A4;margin:16mm;@bottom-center{content:"بُن العجوز — " counter(page);font-family:Agouz;font-size:10pt}}
    body{font-family:Agouz;font-size:12pt;color:#352719;line-height:1.5}header{border-bottom:3px solid #b48d42;padding-bottom:10pt}h1{font-size:25pt;margin:0}h2{font-size:16pt;margin:18pt 0 6pt}p{color:#766145}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#352719;color:white}td,th{padding:7pt;border:1px solid #ddcfb5;text-align:right;overflow-wrap:anywhere}tr{break-inside:avoid}thead{display:table-header-group}tbody tr:nth-child(even){background:#faf7f0}
    </style></head><body><header><h1>بُن العجوز — أصل المزاج</h1><h2>'''+escape(title)+'</h2><p>'+escape(period)+'</p></header>'+''.join(parts)+'</body></html>'
    return HTML(string=markup,url_fetcher=fetch).write_pdf(font_config=FontConfiguration())


def report_pdf(report):
    from reporting import number
    labels={'revenue':'المبيعات المسجلة','cost':'تكلفة البضاعة','gross':'مجمل الربح','spent':'مصروفات التشغيل','net':'صافي الربح'}
    return pdf_bytes('ملخص النتائج المالية',report.from_date+' — '+report.to_date,[
        ('ملخص الفترة',['البيان','جنيه مصري'],[[label,number(report.summary['report'],key)] for key,label in labels.items()]),
        ('الأيام المسجلة',['التاريخ','المبيعات','الصافي'],[[r['date'],r['sales'],r['profit']] for r in report.daily]),
        ('نطاق التقرير',['ملاحظات'],[['المبيعات تستبعد المرتجعات وتضم أيام الكاشير المعتمدة مرة واحدة.'],['الصافي بعد مصروفات التشغيل، دون المسحوبات الشخصية.'],['إصدار البيانات: '+str(report.source['version'])]])])


def invoice_pdf(invoice):
    from reporting import number,text,business_day
    total,paid,remaining=(number(invoice,k,nonnegative=True) for k in ['totalAmount','paidAmount','remainingAmount'])
    if abs(total-paid-remaining)>Decimal('0.011'):raise ValueError('INVOICE_TOTAL_MISMATCH')
    rows=invoice['items']
    if not isinstance(rows,list) or not 1<=len(rows)<=500:raise ValueError('PDF_ROW_LIMIT')
    lines=[[text(r,'itemName'),number(r,'quantity',nonnegative=True),text(r,'unitLabel'),number(r,'unitPrice',nonnegative=True),number(r,'totalPrice',nonnegative=True)] for r in rows]
    return pdf_bytes(('فاتورة مرتجعة — ' if invoice.get('isReturned') else 'فاتورة مبيعات — ')+text(invoice,'invoiceNumber'),business_day(invoice),[
        ('العميل',['الاسم','الهاتف'],[[text(invoice,'customerName'),text(invoice,'customerPhone',True)]]),
        ('محتويات الفاتورة',['الصنف','الكمية','الوحدة','السعر','الإجمالي'],lines),
        ('الحساب',['البيان','جنيه مصري'],[['قبل الخصم',number(invoice,'subtotal')],['الخصم',number(invoice,'discount')],['الإجمالي',total],['المدفوع',paid],['المتبقي',remaining]])])
