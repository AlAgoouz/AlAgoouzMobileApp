export function storeWriteError(message:string):string {
  if(/OWNER_REQUIRED/.test(message))return 'استعادة النسخة متاحة لحساب المالك المؤكد فقط.';
  if(/PAYMENT_EXCEEDS_DEBT|PAYMENT_EXCEEDS_INVOICE/.test(message))return 'السداد أكبر من المديونية المستحقة؛ راجع المبلغ والفواتير المفتوحة.';
  if(/PAYROLL_/.test(message))return 'حركة العامل لا تطابق مستحقاته أو سجل الشهر؛ راجع الراتب والشهر ومصدر الصرف.';
  if(/INVENTORY_MOVEMENT|PRODUCTION_|INVALID_SALE_RECIPE|STOCK_UNIT_CHANGE/.test(message))return 'الرصيد أو الوصفة لا يطابق حركات المخزون؛ راجع الكميات وانتظر تأكيد الحفظ قبل المتابعة.';
  if(/IMMUTABLE|PURCHASE_HAS_LATER|HISTORICAL_ITEM|LEGACY_PAYROLL/.test(message))return 'هذه الحركة مرتبطة بسجل سابق؛ استخدم الإلغاء أو العكس المخصص مع الحفاظ على الأصل.';
  if(/ACCOUNT_BALANCE|INVOICE_PAYMENT_HISTORY|PARTNER_.*HISTORY/.test(message))return 'الرصيد المالي لا يطابق الحركات المسجلة؛ راجع تفاصيل السداد أو الصرف.';
  if(/INVALID_STORE_SCHEMA|INVALID_BUSINESS_DATE|DUPLICATE_|_MISMATCH|_REQUIRED|INVALID_/.test(message))return 'رفض الخادم بيانات غير مكتملة أو غير متسقة؛ راجع تفاصيل العملية. مسودتك ما زالت محفوظة على الجهاز.';
  return message;
}
