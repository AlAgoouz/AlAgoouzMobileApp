import React, { useState } from 'react';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowLeft,
  AlertCircle,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { Partner } from '../types/erp';

interface LoginScreenProps {
  partners: Partner[];
  onLoginSuccess: (partner: Partner, rememberMe: boolean) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  partners,
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [shakeCard, setShakeCard] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [focusedField, setFocusedField] = useState<'user' | 'pass' | null>(
    null
  );

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setShakeCard(true);
    setTimeout(() => setShakeCard(false), 500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanInput = username.trim().toLowerCase();
    const matched = partners.find((p, idx) => {
      const u = (p.username || `owner${idx + 1}`).toLowerCase();
      const n = p.name.trim().toLowerCase();
      const num = String(idx + 1);
      return (
        u === cleanInput ||
        n === cleanInput ||
        n.replace('أ', 'ا').replace('إ', 'ا') ===
          cleanInput.replace('أ', 'ا').replace('إ', 'ا') ||
        cleanInput === num ||
        (idx === 0 && cleanInput === 'admin')
      );
    });

    if (!matched) {
      triggerError('اسم المستخدم غير صحيح، يرجى التأكد من الاسم.');
      return;
    }

    const expectedPass = matched.password || '123';
    if (password.trim() !== expectedPass) {
      triggerError('كلمة المرور غير صحيحة.');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      onLoginSuccess(matched, rememberMe);
    }, 550);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#16100C] via-[#211813] to-[#120D0A] text-[#1E1612] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* مؤثرات ضوئية ذهبية متحركة في الخلفية */}
      <div className="pointer-events-none absolute -top-24 -right-24 w-80 h-80 rounded-full bg-gradient-to-br from-[#D4AF37]/30 via-[#C59B27]/15 to-transparent blur-3xl animate-pulse-glow" />
      <div
        className="pointer-events-none absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-gradient-to-tr from-[#C59B27]/25 via-[#9E7918]/10 to-transparent blur-3xl animate-pulse-glow"
        style={{ animationDelay: '2s' }}
      />
      <div className="pointer-events-none absolute top-1/4 left-10 w-2 h-2 rounded-full bg-[#D4AF37]/40 animate-float-slow" />
      <div
        className="pointer-events-none absolute bottom-1/4 right-12 w-2.5 h-2.5 rounded-full bg-[#FBF5B7]/30 animate-float-slow"
        style={{ animationDelay: '1.5s' }}
      />
      <div
        className="pointer-events-none absolute top-1/3 right-1/4 w-1.5 h-1.5 rounded-full bg-[#D4AF37]/35 animate-float-slow"
        style={{ animationDelay: '2.7s' }}
      />

      {/* الكارت الاحترافي الفاخر مع أنيميشن الدخول والاهتزاز عند الخطأ */}
      <div
        className={`w-full max-w-[395px] animate-card-enter z-10 ${
          shakeCard ? 'animate-shake' : ''
        }`}
      >
        <div className="relative rounded-[32px] p-[1.5px] bg-gradient-to-b from-[#FBF5B7]/80 via-[#C59B27]/50 to-[#9E7918]/30 shadow-[0_25px_70px_-10px_rgba(0,0,0,0.65)]">
          <div className="bg-[#FAF8F4] rounded-[31px] overflow-hidden">
            {/* هيدر الكارت الفخم مع مؤثر البخار الذهبي والهالة الدوارة حول اللوجو */}
            <div className="bg-gradient-to-b from-[#261C15] via-[#1E1612] to-[#150F0C] text-white px-6 pt-7 pb-7 text-center relative border-b-2 border-[#C59B27] overflow-hidden">
              {/* إضاءة ذهبية خلف اللوجو */}
              <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-44 h-44 rounded-full bg-[#D4AF37]/15 blur-2xl animate-pulse-glow" />

              {/* شارة الأمان العلوية */}
              <div className="relative inline-flex items-center gap-1.5 bg-white/5 backdrop-blur-md border border-[#C59B27]/40 text-[#FBF5B7] px-3.5 py-1 rounded-full text-[10px] font-extrabold mb-3 shadow-sm">
                <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>بوابة الدخول الآمن</span>
                <Sparkles className="w-3 h-3 text-[#D4AF37] animate-pulse" />
              </div>

              {/* موجات بخار القهوة الذهبية المتحركة أعلى اللوجو */}
              <div className="flex justify-center gap-2.5 h-4 mb-1 items-end">
                <span className="w-1 h-3 rounded-full bg-gradient-to-t from-[#D4AF37]/60 to-transparent animate-steam-1" />
                <span className="w-1 h-4 rounded-full bg-gradient-to-t from-[#FBF5B7]/70 to-transparent animate-steam-2" />
                <span className="w-1 h-3 rounded-full bg-gradient-to-t from-[#D4AF37]/60 to-transparent animate-steam-3" />
              </div>

              {/* اللوجو الشفاف المجسم 3D بدون أي مربع أو خلفية */}
              <div className="relative w-36 h-36 mx-auto mb-2 flex flex-col items-center justify-center">
                {/* هالة ضوئية ذهبية مشعة خلف المجسم */}
                <div className="pointer-events-none absolute inset-2 rounded-full bg-gradient-to-tr from-[#C59B27]/35 via-[#FBF5B7]/25 to-transparent blur-xl animate-pulse-glow" />

                <img
                  src="/logo.png"
                  alt="بُن العجوز - أصل المزاج"
                  className="relative w-32 h-32 object-contain animate-logo-3d select-none"
                />

                {/* ظل أرضي 3D يتفاعل مع طفو اللوجو */}
                <div className="w-20 h-2.5 rounded-full bg-black/75 blur-sm mt-1 animate-floor-shadow" />
              </div>

              {/* اسم المحل بلمعة ذهبية متحركة */}
              <h1 className="text-2xl font-black tracking-wide animate-gold-shimmer">
                بُن العجوز
              </h1>
              <p className="text-[11px] font-bold text-[#D4AF37]/90 mt-1">
                أصل المزاج • نظام الإدارة والحسابات
              </p>
            </div>

            {/* نموذج الدخول بالاسم وكلمة المرور فقط مع مؤثرات التركيز التفاعلية */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {errorMsg && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-3 flex items-center gap-2 text-xs font-extrabold shadow-sm animate-card-enter">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* حقل اسم المستخدم */}
              <div className="space-y-1.5">
                <label
                  className={`text-xs font-black block px-1 transition-colors duration-300 ${
                    focusedField === 'user'
                      ? 'text-[#9E7918]'
                      : 'text-[#2C201A]'
                  }`}
                >
                  اسم المستخدم
                </label>
                <div
                  className={`relative flex items-center gap-3 bg-white border rounded-2xl px-3.5 py-3 transition-all duration-300 ${
                    focusedField === 'user'
                      ? 'border-[#C59B27] shadow-[0_6px_20px_rgba(197,155,39,0.16)] -translate-y-0.5'
                      : 'border-[#DED6C6] shadow-sm'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 transition-all duration-300 ${
                      focusedField === 'user'
                        ? 'bg-[#1E1612] text-[#FBF5B7] border-[#C59B27] scale-105 shadow-md'
                        : 'bg-[#FDF8EB] text-[#9E7918] border-[#E8D8A8]'
                    }`}
                  >
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onFocus={() => setFocusedField('user')}
                    onBlur={() => setFocusedField(null)}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="أدخل اسم المستخدم"
                    autoComplete="username"
                    className="w-full text-sm font-extrabold bg-transparent focus:outline-none text-[#1E1612] placeholder:text-[#A39686] placeholder:font-semibold"
                    required
                  />
                  {/* خط ذهبي متمدد أسفل الحقل عند التركيز */}
                  <span
                    className={`absolute bottom-0 right-4 left-4 h-[2px] bg-gradient-to-l from-transparent via-[#C59B27] to-transparent transition-transform duration-300 ${
                      focusedField === 'user' ? 'scale-x-100' : 'scale-x-0'
                    }`}
                  />
                </div>
              </div>

              {/* حقل كلمة المرور */}
              <div className="space-y-1.5">
                <label
                  className={`text-xs font-black block px-1 transition-colors duration-300 ${
                    focusedField === 'pass'
                      ? 'text-[#9E7918]'
                      : 'text-[#2C201A]'
                  }`}
                >
                  كلمة المرور
                </label>
                <div
                  className={`relative flex items-center gap-3 bg-white border rounded-2xl px-3.5 py-3 transition-all duration-300 ${
                    focusedField === 'pass'
                      ? 'border-[#C59B27] shadow-[0_6px_20px_rgba(197,155,39,0.16)] -translate-y-0.5'
                      : 'border-[#DED6C6] shadow-sm'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 transition-all duration-300 ${
                      focusedField === 'pass'
                        ? 'bg-[#1E1612] text-[#FBF5B7] border-[#C59B27] scale-105 shadow-md'
                        : 'bg-[#FDF8EB] text-[#9E7918] border-[#E8D8A8]'
                    }`}
                  >
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onFocus={() => setFocusedField('pass')}
                    onBlur={() => setFocusedField(null)}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full text-sm font-extrabold bg-transparent focus:outline-none text-[#1E1612] placeholder:text-[#A39686]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1.5 rounded-lg text-[#8C7B6B] hover:text-[#1E1612] hover:bg-[#FAF8F4] transition"
                    title={
                      showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                  {/* خط ذهبي متمدد أسفل الحقل عند التركيز */}
                  <span
                    className={`absolute bottom-0 right-4 left-4 h-[2px] bg-gradient-to-l from-transparent via-[#C59B27] to-transparent transition-transform duration-300 ${
                      focusedField === 'pass' ? 'scale-x-100' : 'scale-x-0'
                    }`}
                  />
                </div>
              </div>

              {/* خيار تذكر الدخول */}
              <div className="flex items-center justify-between pt-0.5 px-1">
                <label className="flex items-center gap-2 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 accent-[#1E1612] rounded cursor-pointer transition-transform group-hover:scale-110"
                  />
                  <span className="text-xs font-bold text-[#6E5D4F] group-hover:text-[#1E1612] transition-colors">
                    تذكر دخولي على هذا الجهاز
                  </span>
                </label>
              </div>

              {/* زر تسجيل الدخول الفاخر مع شعاع اللمعة الذهبي وحالة التحميل */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="relative overflow-hidden w-full bg-gradient-to-l from-[#1E1612] via-[#2C201A] to-[#1E1612] hover:from-[#2C201A] hover:to-[#1E1612] text-[#FBF5B7] border border-[#C59B27] font-black text-sm py-3.5 rounded-2xl shadow-[0_10px_25px_-5px_rgba(30,22,18,0.4)] hover:shadow-[0_12px_30px_-5px_rgba(197,155,39,0.35)] flex items-center justify-center gap-2 transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98] mt-2 group"
              >
                {/* شعاع ضوئي يعبر الزر */}
                <span className="pointer-events-none absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-[#FBF5B7]/25 to-transparent animate-shine-sweep" />

                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 text-[#D4AF37] animate-spin" />
                    <span>جاري فتح النظام...</span>
                  </>
                ) : (
                  <>
                    <span>تسجيل الدخول</span>
                    <ArrowLeft className="w-4 h-4 text-[#D4AF37] transition-transform duration-300 group-hover:-translate-x-1" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* حقوق الملكية أسفل الكارت */}
      <div className="text-center mt-5 text-[11px] text-[#D8CBB8]/70 font-bold z-10">
        بُن العجوز — أصل المزاج © {new Date().getFullYear()}
      </div>
    </div>
  );
};
