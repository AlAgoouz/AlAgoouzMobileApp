const specificErrors:Record<string,string>={
  RETURN_PAYMENT_RECONCILIATION_REQUIRED:'المتبقي على الفاتورة لا يطابق مديونية العميل؛ راجع التحصيلات قبل المرتجع.',
  RETURN_FINANCIAL_MISMATCH:'مبلغ المرتجع أو عكس المديونية لا يطابق الفاتورة.',
  STORE_TOO_LARGE:'حجم البيانات تجاوز الحد المسموح؛ تواصل مع المالك.',
  RECIPE_CYCLE_OR_DEPTH:'راجع الوصفة: يوجد اعتماد دائري أو تداخل أكبر من الحد المسموح.',
  INVALID_SALES_QUANTITY:'كمية البيع لازم تكون أكبر من صفر.',
  CASHIER_COST_PURCHASE_EVIDENCE_REQUIRED:'تعذر مطابقة رصيد ما قبل التوريد لتسوية تكلفة الكاشير. حدّث البيانات وأعد اعتماد فاتورة الشراء.',
  CASHIER_COST_MISMATCH:'تكلفة الكاشير لا تطابق تفاصيل الأصناف؛ راجع المطابقة والمكونات.',
};

export class StoreWriteFailure extends Error {
  constructor(public readonly code:string,message:string,public readonly transient=false){
    super(message);
  }
}

export function storeWriteError(message:string):string {
  const code=/^[A-Z][A-Z0-9_]+/.exec(message)?.[0];
  if(code&&specificErrors[code])return specificErrors[code];
  if(/USER_PERMISSION_DENIED/.test(message))return 'ليس لديك تصريح لتنفيذ هذه العملية أو تغيرت صلاحياتك؛ راجع المالك ثم حدّث بيانات الدخول.';
  if(/CONTACT_DETAILS_REQUIRED/.test(message))return 'أكمل رقم التليفون والمنطقة للعميل، أو العنوان واسم المندوب للمورد، قبل إنشاء الفاتورة.';
  if(/CLIENT_UPGRADE_REQUIRED|INVALID_STATE: cashier_days/.test(message))return 'تم تحديث قواعد التشغيل؛ أعد تحميل الصفحة قبل تسجيل عملية جديدة.';
  if(/NEW_PURCHASE_FULL_PAYMENT/.test(message))return 'المشتريات الجديدة مدفوعة بالكامل، ويجب أن يشمل المدفوع الضريبة.';
  if(/WHOLESALE_BLENDS_ONLY|NEW_SALE_WHOLESALE_CUSTOMER/.test(message))return 'اختر عميلًا مسجلًا وتوليفات فقط لفاتورة الجملة.';
  if(/INSUFFICIENT_STOCK|WHOLESALE_INSUFFICIENT|PRODUCTION_INSUFFICIENT/.test(message))return 'المخزون غير كافٍ لاعتماد الجملة أو الإنتاج؛ راجع الكميات.';
  if(/CASHIER_REPORT_IMMUTABLE|DUPLICATE_CASHIER|LEGACY_CASHIER_DAY/.test(message))return 'التقرير مسجل بالفعل لهذا اليوم؛ لا يمكن تكراره أو تعديل يوم معتمد.';
  if(/OWNER_REQUIRED/.test(message))return 'استعادة النسخة متاحة لحساب المالك المؤكد فقط.';
  if(/PAYMENT_EXCEEDS_DEBT|PAYMENT_EXCEEDS_INVOICE/.test(message))return 'السداد أكبر من المديونية المستحقة؛ راجع المبلغ والفواتير المفتوحة.';
  if(/PAYROLL_/.test(message))return 'حركة العامل لا تطابق مستحقاته أو سجل الشهر؛ راجع الراتب والشهر ومصدر الصرف.';
  if(/INVENTORY_MOVEMENT|PRODUCTION_|INVALID_SALE_RECIPE|STOCK_UNIT_CHANGE/.test(message))return 'الرصيد أو الوصفة لا يطابق حركات المخزون؛ راجع الكميات وانتظر تأكيد الحفظ قبل المتابعة.';
  if(/IMMUTABLE|PURCHASE_HAS_LATER|HISTORICAL_ITEM|LEGACY_PAYROLL/.test(message))return 'هذه الحركة مرتبطة بسجل سابق؛ استخدم الإلغاء أو العكس المخصص مع الحفاظ على الأصل.';
  if(/ACCOUNT_BALANCE|INVOICE_PAYMENT_HISTORY|PARTNER_.*HISTORY/.test(message))return 'الرصيد المالي لا يطابق الحركات المسجلة؛ راجع تفاصيل السداد أو الصرف.';
  if(/INVALID_STORE_SCHEMA|INVALID_BUSINESS_DATE|DUPLICATE_|_MISMATCH|_REQUIRED|INVALID_/.test(message))return 'رفض الخادم بيانات غير مكتملة أو غير متسقة؛ راجع تفاصيل العملية.';
  return message;
}
