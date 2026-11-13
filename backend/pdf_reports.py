import ctypes
import hashlib
import html
import io
import contextlib
from pathlib import Path
from string import Template
from threading import Lock
from decimal import Decimal

_lock=Lock()
_libraries=[]
_ready=False
_ASSETS=Path(__file__).parent/'assets'
_SHOP_ADDRESS='3 شارع المطافي، الزيتون - القاهرة'
_SHOP_PHONE='01201144388'


def render_pdf(markup, resources):
    initialize_pdf()
    from weasyprint import HTML
    from weasyprint.text.fonts import FontConfiguration
    from weasyprint.urls import URLFetcher,URLFetcherResponse

    class LocalAssetFetcher(URLFetcher):
        def fetch(self,url,headers=None):
            if url not in resources:
                raise ValueError('PDF_RESOURCE_DENIED')
            filename,mime=resources[url]
            return URLFetcherResponse(url,body=(_ASSETS/filename).read_bytes(),headers={'Content-Type':mime})

    protocols={url.split(':',1)[0] for url in resources}
    fetcher=LocalAssetFetcher(allowed_protocols=protocols,fail_on_errors=True)
    return HTML(string=markup,url_fetcher=fetcher).write_pdf(font_config=FontConfiguration())



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
    escape=lambda v:html.escape('غير مكتمل' if v is None else str(v),quote=True)
    parts=[]
    for heading,columns,rows in sections:
        if len(rows)>1000:raise ValueError('PDF_ROW_LIMIT')
        content=''.join('<tr>'+''.join('<td>'+escape(f'{v:,.2f}' if isinstance(v,Decimal) else v)+'</td>' for v in row)+'</tr>' for row in rows)
        parts.append('<h2>'+escape(heading)+'</h2><table><thead><tr>'+''.join('<th>'+escape(c)+'</th>' for c in columns)+'</tr></thead><tbody>'+content+'</tbody></table>')
    markup='''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
    @font-face{font-family:Agouz;src:url('agouz-font:amiri')}@font-face{font-family:Agouz;font-weight:bold;src:url('agouz-font:amiri')}@page{size:A4;margin:16mm;@bottom-center{content:"بُن العجوز — " counter(page);font-family:Agouz;font-size:10pt}}
    body{font-family:Agouz;font-size:12pt;color:#352719;line-height:1.5}header{border-bottom:3px solid #b48d42;padding-bottom:10pt}h1{font-size:25pt;margin:0}h2{font-size:16pt;margin:18pt 0 6pt}p{color:#766145}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#352719;color:white}td,th{padding:7pt;border:1px solid #ddcfb5;text-align:right;overflow-wrap:anywhere}tr{break-inside:avoid}thead{display:table-header-group}tbody tr:nth-child(even){background:#faf7f0}
    </style></head><body><header><h1>بُن العجوز — أصل المزاج</h1><h2>'''+escape(title)+'</h2><p>'+escape(period)+'</p></header>'+''.join(parts)+'</body></html>'
    return render_pdf(markup,{'agouz-font:amiri':('Amiri-Regular.ttf','font/ttf')})


def report_pdf(report):
    from reporting import number
    labels={'revenue':'المبيعات المسجلة','cost':'تكلفة البضاعة','gross':'مجمل الربح','spent':'مصروفات التشغيل','net':'صافي الربح'}
    opening=report.source.get('financial_openings',[])
    extra=[('رصيد أول المدة المستقل عن الربح',['التاريخ','خزنة الشركة'],[[opening[0]['date'],number(opening[0],'amount',nonnegative=True)]])] if opening else []
    return pdf_bytes('ملخص النتائج المالية','من '+report.from_date+' إلى '+report.to_date,[
        ('ملخص الفترة',['البيان','جنيه مصري'],[[label,number(report.summary['report'],key,True) if report.summary['report'].get(key) is not None else 'بانتظار تكلفة الأصناف'] for key,label in labels.items()]),
        ('الأيام المسجلة',['التاريخ','المبيعات','الصافي'],[[r['date'],r['sales'],r['profit']] for r in report.daily]),
        ('نطاق التقرير',['ملاحظات'],[['المبيعات تضم الإيراد المالي لكل يوم مرة واحدة؛ الربح ينتظر اكتمال تكلفة الأصناف، والقيمة غير المكتملة ليست صفرًا.'],['الصافي بعد مصروفات التشغيل، دون المسحوبات الشخصية. رصيد البداية مستقل عن المبيعات والربح.'],['إصدار البيانات: '+str(report.source['version'])]])]+extra+([('حركة أموال النشاط',['البيان','القيمة'],[[label,number(report.summary['cash'],key,True) if report.summary['cash'].get(key) is not None else 'غير متاح'] for key,label in {'opening':'رصيد بداية الفترة','inflow':'المتحصلات','resources':'بداية الفترة + المتحصلات','outflow':'المدفوعات','closing':'الرصيد الدفتري'}.items()])] if report.summary.get('cash') else []))


def invoice_pdf(invoice):
    from reporting import number,text,business_day
    total,paid,remaining=(number(invoice,k,nonnegative=True) for k in ['totalAmount','paidAmount','remainingAmount'])
    if abs(total-paid-remaining)>Decimal('0.011'):raise ValueError('INVOICE_TOTAL_MISMATCH')
    rows=invoice['items']
    if not isinstance(rows,list) or not 1<=len(rows)<=500:raise ValueError('PDF_ROW_LIMIT')
    lines=[[text(r,'itemName'),format(number(r,'quantity',nonnegative=True),'f'),text(r,'unitLabel'),number(r,'unitPrice',nonnegative=True),number(r,'totalPrice',nonnegative=True)] for r in rows]
    subtotal,discount=number(invoice,'subtotal',nonnegative=True),number(invoice,'discount',nonnegative=True)
    if any(Decimal(line[1])<=0 for line in lines) or abs(sum(line[4] for line in lines)-subtotal)>Decimal('0.011') or abs(subtotal-discount-total)>Decimal('0.011'):
        raise ValueError('INVOICE_TOTAL_MISMATCH')
    if invoice.get('saleType')=='wholesale':
        return wholesale_invoice_pdf(invoice,lines,subtotal,discount,total,paid,remaining)
    return pdf_bytes(('فاتورة مرتجعة — ' if invoice.get('isReturned') else 'فاتورة مبيعات — ')+text(invoice,'invoiceNumber'),business_day(invoice),[
        ('العميل',['الاسم','الهاتف'],[[text(invoice,'customerName'),text(invoice,'customerPhone',True)]]),
        ('محتويات الفاتورة',['الصنف','الكمية','الوحدة','السعر','الإجمالي'],lines),
        ('الحساب',['البيان','جنيه مصري'],[['قبل الخصم',number(invoice,'subtotal')],['الخصم',number(invoice,'discount')],['الإجمالي',total],['المدفوع',paid],['المتبقي',remaining]])])


def wholesale_invoice_pdf(invoice, lines, subtotal, discount, total, paid, remaining):
    from reporting import business_day,text

    def money(value):
        return f'<span class="money"><bdi dir="ltr">{value:,.2f}</bdi> ج.م</span>'

    def amount(label, value):
        return f'<div class="amount"><span>{label}</span>{money(value)}</div>'

    if invoice.get('isReturned'):
        status,status_class='مرتجعة','returned'
    elif remaining==0:
        status,status_class='مدفوعة','paid'
    elif paid>0:
        status,status_class='مدفوعة جزئيًا','open'
    else:
        status,status_class='آجلة','open'

    rows=''.join(
        f'<tr><td>{index}</td><td><bdi>{html.escape(name)}</bdi></td>'
        f'<td><bdi dir="ltr">{quantity}</bdi> {html.escape(unit)}</td>'
        f'<td>{money(price)}</td><td>{money(value)}</td></tr>'
        for index,(name,quantity,unit,price,value) in enumerate(lines,1)
    )
    # Current wholesale invoices have no tax charge. Their saved totals are used as-is.
    payment=''
    if remaining>0 and not invoice.get('isReturned'):
        payment=amount('المدفوع',paid)+amount('المتبقي',remaining)
    template=Template((_ASSETS/'wholesale-invoice.html').read_text(encoding='utf-8'))
    markup=template.substitute(
        invoice_number=html.escape(text(invoice,'invoiceNumber')),
        shop_address=_SHOP_ADDRESS,shop_phone=_SHOP_PHONE,
        customer=html.escape(text(invoice,'customerName')),
        customer_phone=html.escape(text(invoice,'customerPhone',True)) or 'غير مسجل',
        issue_date=business_day(invoice),
        status=status,status_class=status_class,rows=rows,
        subtotal=amount('قبل الخصم',subtotal) if discount>0 else '',
        discount=money(discount),tax=money(Decimal(0)),total=money(total),payment=payment,
    )
    return render_pdf(markup,{
        'agouz-asset:cairo':('Cairo-Variable.ttf','font/ttf'),
        'agouz-asset:invoice-logo':('invoice-logo.webp','image/webp'),
    })
