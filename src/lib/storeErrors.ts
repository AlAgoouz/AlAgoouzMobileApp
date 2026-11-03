export function storeWriteError(message:string):string {
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
  if(/INVALID_STORE_SCHEMA|INVALID_BUSINESS_DATE|DUPLICATE_|_MISMATCH|_REQUIRED|INVALID_/.test(message))return 'رفض الخادم بيانات غير مكتملة أو غير متسقة؛ راجع تفاصيل العملية. مسودتك ما زالت محفوظة على الجهاز.';
  return message;
}
