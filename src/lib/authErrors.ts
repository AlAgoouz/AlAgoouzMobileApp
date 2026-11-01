export function authErrorMessage(error: unknown, action: 'signIn' | 'signUp'): string {
  const info = error && typeof error === 'object'
    ? error as { code?: string; status?: number; name?: string }
    : {};
  switch (info.code) {
    case 'email_not_confirmed':
      return 'البريد لم يُؤكَّد بعد؛ افتح رسالة التأكيد في بريدك ثم سجّل الدخول.';
    case 'invalid_credentials':
      return 'البريد أو كلمة المرور غير صحيحين. لو دي أول مرة، اختر «إنشاء حساب المالك لأول مرة».';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'محاولات كثيرة خلال وقت قصير؛ انتظر بضع دقائق ثم حاول مرة أخرى.';
    case 'email_address_not_authorized':
      return 'خدمة البريد لا تسمح بإرسال التأكيد لهذا العنوان؛ يلزم مراجعة إعداد إرسال البريد.';
    case 'user_already_exists':
    case 'email_exists':
      return 'الحساب موجود بالفعل؛ ارجع لتسجيل الدخول بالبريد وكلمة المرور.';
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'التسجيل بالبريد غير متاح حاليًا؛ يلزم مراجعة إعدادات الدخول.';
  }
  if (info.status === 429)
    return 'محاولات كثيرة خلال وقت قصير؛ انتظر بضع دقائق ثم حاول مرة أخرى.';
  if (info.status === 0 || info.name === 'AuthRetryableFetchError' || info.name === 'TypeError')
    return 'تعذر الاتصال بخدمة الدخول؛ تحقق من الإنترنت ثم حاول مرة أخرى.';
  if (info.status && info.status >= 500)
    return 'خدمة الدخول تواجه مشكلة مؤقتة؛ حاول لاحقًا.';
  return action === 'signIn'
    ? 'تعذر تسجيل الدخول؛ حاول مرة أخرى. إذا استمرت المشكلة تواصل مع المسؤول.'
    : 'تعذر إنشاء الحساب؛ تحقق من البريد أو سجل الدخول إذا كان موجودًا.';
}
