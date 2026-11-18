# خطة تطوير الشكل والتصميم — نظام تصميم v2 لمشروع "بُن العجوز"

**الملف:** `docs/DESIGN_SYSTEM_V2_AR.md`
**النطاق:** الواجهة الأمامية (`src/`) — نظام التصميم، البنية البصرية، تجربة المستخدم
**التاريخ:** 2026-11-15

---

## ٠. التقييم الصادق أولًا

الهوية البصرية الحالية **ليست ضعيفة**. هي مبنية على أساس صحيح:

| العنصر | الحالة | الحكم |
|---|---|---|
| لوحة الألوان | بنّي إسبريسو + ذهبي دافئ + ورقي | ✅ متّسقة ومميّزة، وتليق بمقهى/محل قهوة |
| الخط | Cairo (400→900) | ✅ مناسب للعربية، ويعرف الأرقام العربية أيضاً |
| الاتجاه | RTL كامل مع منطق `inset-inline` | ✅ مدروس وليس مجرد `direction: rtl` |
| نقاط اللمس | `min-height:44px` على كل زر/حقل | ✅ متوافق مع إبهام الهاتف |
| الوصولية | `focus-visible`، `prefers-reduced-motion`، `aria-current` | ✅ تُطبَّق في كل مكان |
| الطباعة | قواعد `@media print` لكل شاشة | ✅ نادر جداً في مشاريع ERP |
| الموبايل | شريط سفلي + تخطيط مكدّس | ✅ أولوية صحيحة لمحل متنقّل |
| قائمة العملاء | `shop-menu.css` بلغة سائلة حديثة (`clamp`, `container-type`) | ✅ أرقى ما في المشروع |

### إذن ما المشكلة؟

**المشكلة ليست في "الشكل" — المشكلة في أن نظام التصميم مسرّب (leaking).**

الكود ينوي واجهة واحدة متماسكة، لكنه ينتج **6 ملفات CSS تتoverride بعضها**، فيها **397 قيمة لون hex مختلفة**، و**4 كتل `:root` متعارضة**، و**10 نقاط توقف مختلفة**. النتيجة: كل شاشة تبدو صحيحة منفردة، لكن المشروع ككل **لا يبدو من عائلة واحدة**.

> **الخلاصة:** لا تُعدّل الألوان أو الشعار. **اجمع ما هو مبعثر.**

---

## ١. التشخيص — 8 أرقام تكفي للحكم

| # | المؤشر | القيمة | الأثر |
|---|---|---|---|
| 1 | قيم hex فريدة في CSS | **397** | لا يمكن صيانة اللوحة ولا تدقيقها |
| 2 | كتل `:root` متعارضة | **4** (`index`/`visual`/`card`/`interaction`) | القيمة النهائية تعتمد على **ترتيب الاستيراد** |
| 3 | «ذهبيات» مختلفة | `#8c6427` · `#ddb877` · `#ae873e` · `#a57d23` · `#aa7c35` · `#b68b3d` | الأزرار والرسم البياني والحدود تبدو من مشروعين |
| 4 | نقاط توقف مختلفة | **~10** (359/400/639/640/699/700/767/768/950/1100/1200) | تخطيط «مكسور» عند عروض بعينها |
| 5 | فجوة في التغطية | **1100–1199px** بلا شبكة العمودين | مع وجود الشريط الجانبي ⇒ عمود واحد على شاشة عريضة |
| 6 | أوزان خطوط غير متوفرة | `750` / `850` في **20 موضعاً** | Cairo مُحمَّل بـ (400,500,600,700,800,900) ⇒ 750/850 يُقرَّبان بصمت ⇒ سماكة غير متسقة |
| 7 | أنصاف أقطار مختلفة | **16+ قيمة** (7px…28px) | البطاقات: 16px / 22px / 26px حسب الشاشة |
| 8 | حلقات تركيز مختلفة | 3 (#a57d23 / var(--gold) / #aa7c35 / #ac843b) | تفاوت بصري عند التنقل بلوحة المفاتيح |

### 1.1 أخطر نقطة: كتل `:root` المتعارضة

الترتيب في `src/main.tsx`:
```
index.css → visual-system.css → card-surfaces.css → section-system.css → record-system.css → interaction-design.css
```
الملف الأخير يفوز. فالنتيجة الفعلية:

| Token | كتبه | كتبه | **الفائز الفعلي** | كُتب عليه |
|---|---|---|---|---|
| `--espresso` | `#38271b` (visual) | `#34251d` (interaction) | `#34251d` | لكن `visual-system.css:87` يكتب `#38271b` **حرفياً** للشريط الجانبي ⇒ بنّيان مختلفان |
| `--line` | `#c3a76f` (visual, **ذهبي**) | `#ded3c5` (interaction, **رمادي دافئ**) | `#ded3c5` | ⇒ تعليق `card-surfaces.css:1` «White surfaces use **gold edges**» لم يعد صحيحًا |
| `--surface-radius` | `24px` (card) | `18px` (interaction) | `18px` | ⇒ `visual-system.css` يبني على `--radius:20px` (token **آخر**) |
| `--control-line` | `#947c5a` (visual) | `#8c7762` (interaction) | `#8c7762` | ⇒ حدود الحقول تغيّرت عن المقصود |
| `--gold` | `#8c6427` (visual) | — | `#8c6427` | ⇒ موجودٌ مع `--action-gold:#ddb877` ⇒ **ذهبيان** |

**الحل:** ملف توكنز واحد يُستورد **أولًا**، ولا يُكتب أي `var(--…)` خارجه.

### 1.2 جيلان من التصميم يتعايشان

| جيل «قديم» (px صلب) | جيل «جديد» (rem سائل) |
|---|---|
| `visual-system.css` — 350px / 9rem | `shop-menu.css` — 97rem / 14 `clamp()` |
| `card-surfaces.css` — 110px / 0rem | `workspace-directory.css` — 25rem |
| `catalog-register.css` — 105px / 0rem | `menu-editor.css` — 31rem / 2 `clamp()` |
| `index.css` — 271px / 0rem | `interaction-design.css` — 44rem |

**العملاء يرون صفحة القائمة العامة (`/menu`) بتصميم أحدث-generation من التطبيق الداخلي نفسه.** هذه فجوة هوية حقيقية، لا تفصيل تقني.

### 1.3 أخطاء بصرية مؤكَّدة

| الملف | السطر | المشكلة |
|---|---|---|
| `index.html` | 17 | `class="bg-[#F4F6F9] text-slate-900 selection:bg-blue-600"` — ألوان **Tailwind الافتراضية الباردة** من نظام آخر تمامًا. يُلغيها `index.css` لاحقًا، لكن **قبل تحميل CSS** تظهر ومضة زرقاء باردة، و`selection:bg-blue-600` يظل أزرق داخل تطبيق دافئ |
| `index.css` | 291-296 | شريط التمرير بـ `#cbd5e1` / `#94a3b8` (رمادي بارد من Tailwind) — ظاهر في كل لوحة قابلة للتمرير |
| `App.tsx` | 1059 | `text-[#1E1612]` — **رابع أسود** لا يطابق `--ink` ولا `--espresso`، وهو ما يُطبَّق فعليًا على كل نص التطبيق |
| `App.tsx` | 1766 | الشريط السفلي بـ `shadow-[0_-4px_20px_rgba(30,22,18,0.06)]` inline — خارج نظام `--shadow` |
| `catalog-register.css` | 8 | `background:#fafafa` — رمادي بارد لصفوف الزمردة، داخل تطبيق دافئ |
| `visual-system.css` | 18-19 | `[class*="text-[10px]"]` و`[class*="text-[11px]"]` كلاهما ← `12px` — تجاوز على أدوات Tailwind عشوائية |
| `visual-system.css` | 37 و 93 | `.eyebrow` معرَّف **مرتين** بألوان مختلفة (`var(--gold)` ثم `#80632c!important`) |

### 1.4 زخرفة أعلت من حاجة التطبيق

`index.css` يحوي 9 `@keyframes` زخرفية: `goldShimmer`، `shineSweep`، `floatSlow`، `pulseGlow`، `steamRise`، `logo3dFloat`، `floorShadowPulse`، `cardEnter`… و`card-surfaces.css` يضيف `metric-card::after` دائرة 112px و`::before` شريط متدرّج.

**الأهم — `animate-gold-shimmer` (index.css:246-259) يستخدم `-webkit-text-fill-color:transparent` مع تدرّج متحرك.** تطبيق على نص **أرقام مالية** = خطر قراءة مباشر، ويشتت العين في-table لا يمكن المسح الضوئي فيه.

**قاعدة:** الحركة decoration تُحذف من الأرقام ومن الشاشات الكثيفة. تُبقى فقط: الانتقال بين الشاشات، فتح النافذة، pressed.

---

## ٢. المحور الأول — توحيد نظام التصميم (Design System v2)

> **الأثر:** مع كل الشاشات القائمة. **المخاطرة:** منخفضة إذا تمّت كمرحلة توحيد لا كإعادة تصميم.

### 2.1 ملف التوكنز الوحيد

**ملف جديد:** `src/styles/tokens.css` — **يُستورد أولًا في `main.tsx`**.

```css
/* ==========================================================================
   AGOUZ DESIGN TOKENS — المصدر الوحيد للحقيقة.
   أي قيمة في المشروع يجب أن تأتي من هنا.
   ========================================================================== */

:root {
  color-scheme: light;

  /* ---------- Brand ---------- */
  --brand-espresso:      #2e1f16;   /* نص داكن، الشريط الجانبي */
  --brand-espresso-700:  #3a2819;
  --brand-espresso-900:  #1b130d;
  --brand-gold:          #a97c2e;   /* الذهبي الرسمي — حدود، أيقونات */
  --brand-gold-soft:     #ddb877;   /* ذهبي التفاعل — أزرار */
  --brand-gold-tint:     #f7eeda;   /* خلفية ذهبية خفيفة */

  /* ---------- Surfaces ---------- */
  --surface-page:        #ffffff;
  --surface-card:        #ffffff;
  --surface-sunken:      #faf7f2;   /* حشو داخلي خفيف */
  --surface-raised:      #f2ece1;   /* حشو أعمق (tracks, empty states) */

  /* ---------- Ink ---------- */
  --ink-strong:          #2e1f16;
  --ink-default:         #4a382b;
  --ink-muted:           #7a6857;
  --ink-faint:           #9c8a78;
  --ink-on-dark:         #f7ecd8;
  --ink-on-gold:         #2e1f16;

  /* ---------- Lines ---------- */
  --line-subtle:         #ece3d4;
  --line-default:        #e0d5c2;
  --line-strong:         #c9b48f;
  --line-control:        #b5a083;

  /* ---------- Semantic ---------- */
  --ok:        #246047;  --ok-bg:        #edf6f0;  --ok-line:  #bcd9c7;
  --warn:      #8c6427;  --warn-bg:      #fdf6e6;  --warn-line:#e8d3a4;
  --danger:    #a4352d;  --danger-bg:    #fdf1ee;  --danger-line:#eccbc4;
  --info:      #2f5f7a;  --info-bg:      #eef4f8;  --info-line:#c2d6e2;

  /* ---------- Charts (مصدر واحد) ---------- */
  --chart-1: #a97c2e;   /* إيرادات */
  --chart-2: #2e6b52;   /* ربح */
  --chart-3: #b45309;   /* تكلفة */
  --chart-4: #6b5846;   /* ثابت */
  --chart-5: #a4352d;   /* سالب */
  --chart-track: #f0ebe2;

  /* ---------- Radius ---------- */
  --r-xs:   8px;
  --r-sm:  10px;
  --r-md:  14px;
  --r-lg:  18px;
  --r-xl:  24px;
  --r-pill: 999px;

  /* ---------- Elevation ---------- */
  --sh-1: 0 1px 2px rgba(46,31,22,.06);
  --sh-2: 0 4px 12px -6px rgba(46,31,22,.16), 0 1px 3px rgba(46,31,22,.06);
  --sh-3: 0 16px 40px -16px rgba(46,31,22,.28), 0 2px 8px rgba(46,31,22,.08);
  --sh-inset: inset 0 1px 0 #fff;

  /* ---------- Type scale (rem — لا px) ---------- */
  --fs-2xs: .69rem;  --fs-xs: .78rem;  --fs-sm: .88rem;  --fs-md: 1rem;
  --fs-lg: 1.15rem; --fs-xl: 1.4rem;  --fs-2xl: 1.85rem;--fs-3xl: 2.4rem;

  /* ---------- Motion ---------- */
  --ease-out: cubic-bezier(.2,.7,.3,1);
  --t-fast: .14s;
  --t-base: .22s;

  /* ---------- Layout ---------- */
  --sidebar-w: 252px;
  --nav-h: 66px;
  --shell-max: 1440px;
}
```

### 2.2 نظام نقاط التوقف — 4 فقط

```css
/* نقطة توقف واحدة — لا أرقام عارية في أي ملف */
:root {
  --bp-sm: 480px;
  --bp-md: 768px;
  --bp-lg: 1100px;
  --bp-xl: 1400px;
}
```
بما أن CSS لا يقبل متغيّرات في `@media`، استخدم **ملفًا واحدًا** يحتوي كل الاستعلامات:

```css
/* src/styles/breakpoints.css  — استورد بعد كل ملفات المكوّنات */
@media (min-width: 768px)  { /* md — لوحي */ }
@media (min-width: 1100px) { /* lg — سطح مكتب */ }
@media (min-width: 1400px) { /* xl — عريض */ }
```

**القواعد المعتمدة:**

| المدى | السلوك |
|---|---|
| `< 768` | موبايل — شريط سفلي، مكدّس، صف واحد |
| `768–1099` | لوحي — شبكات 2-3 أعمدة، **بلا** شريط جانبي |
| `1100–1399` | سطح مكتب — شريط جانبي + شبكة عمودين |
| `≥ 1400` | عريض — نفس الشبكة بعرض `min(1440px, 100% - 48px)` |

**إصلاح الفجوة 1100–1199px** — استبدل في `visual-system.css`:
```css
/* ❌ قبل: يترك 1100–1199 بلا شبكة */
@media (min-width:950px) and (max-width:1099px), (min-width:1200px) { ... }

/* ✅ بعد */
@media (min-width: 1100px) { ... }
```
ثم احذف كل `max-width:359px` و`max-width:699px` و`max-width:639px` و`max-width:400px` — واستبدلها بنمط **`@media (max-width: 767px)`** موحّد + `@media (max-width: 380px)` للهاتف الصغير جدًا (رقم واحد مقبول).

### 2.3 أوزان الخطوط — احترم ما هو محمَّل

```css
/* Cairo مُحمَّل بـ 400,500,600,700,800,900 فقط */
/* ❌ 750 و 850 غير موجودة ⇒ تقريب صامت */
/* ✅ استخدم 700 و 800 فقط */
```
سيردّ استبدال آلي عبر `grep`:
```bash
grep -rn "font-weight:\s*750" src/  | sed 's/750/700/g'
grep -rn "font-weight:\s*850" src/  | sed 's/850/800/g'
```
(20 موضعًا في 7 ملفات — تغيير آمن بصريًا، ومُصلح للتناسق.)

### 2.4 حلقات التركيز الموحّدة

```css
/* src/styles/a11y.css */
:where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {
  outline: 2px solid var(--brand-gold);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}
```
وحذف القواعد المتكررة في `index.css:16` و`visual-system.css:17` و`record-system.css:17` و`section-system.css`.

### 2.5 شريط تمرير دافئ + تحديد نص بلون الهوية

```css
/* يحل محل index.css:283-296 */
* { scrollbar-width: thin; scrollbar-color: #cdbda3 transparent; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cdbda3; border-radius: 999px; }
::-webkit-scrollbar-thumb:hover { background: #b09b7c; }

::selection { background: var(--brand-gold-soft); color: var(--ink-on-gold); }
```

### 2.6 إصلاح `index.html`

```html
<!-- ❌ قبل -->
<body class="bg-[#F4F6F9] text-slate-900 antialiased selection:bg-blue-600 selection:text-white">

<!-- ✅ بعد — متوافق مع نظام الهوية، بلا ومضة باردة -->
<body class="agouz-body antialiased">
```
مع في `tokens.css`:
```css
.agouz-body { background: var(--surface-page); color: var(--ink-strong); }
```
> **الأثر:** إزالة الومضة الزرقاء عند التحميل + توحيد لون التحديد.

### 2.7 دمج ملفات CSS

```
قبل (6 ملفات، تصادُمات مت crucifixة):
  index.css → visual-system.css → card-surfaces.css
  → section-system.css → record-system.css → interaction-design.css

بعد:
  styles/tokens.css        ← يُستورد أولًا (المصدر الوحيد)
  styles/base.css          ← reset + طباعة + a11y
  styles/layout.css        ← shell + sidebar + nav
  styles/components.css    ← primitives
  styles/screens/*.css     ← ملف لكل شاشة (lazy)
```
`interaction-design.css` هو **المتداخل الأعنف** — يحتاج قرارًا: إما تذوب محتواه في `tokens`+`components`، أو يُحذف. لا يبقى كما هو.

---

## ٣. المحور الثاني — طبقة مكوّنات أساسية (Primitives)

**المشكلة:** 52 مكوّنًا، كل واحد يخترع زرّه وحقله وبطاقته. `Modal.tsx` هوPrimitive الوحيد.

**المقترح — 9 مكوّنات تغطي ~80% من الاستخدام:**

```tsx
// src/components/ui/Button.tsx
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size   = 'sm' | 'md' | 'lg';

export function Button({variant='secondary', size='md', icon:Icon, children, ...rest}: {
  variant?:Variant; size?:Size; icon?:LucideIcon; children:ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button
    className={`btn btn--${variant} btn--${size}`}
    {...rest}
  >{Icon && <Icon size={size==='lg'?18:16} aria-hidden/>}{children}</button>;
}
```

```css
/* styles/components.css */
.btn {
  display:inline-flex; align-items:center; justify-content:center; gap:.45rem;
  min-height:44px; padding:.5rem .9rem; border-radius:var(--r-sm);
  font-size:var(--fs-sm); font-weight:800; border:1px solid transparent;
  transition:background-color var(--t-fast), border-color var(--t-fast), box-shadow var(--t-fast);
  touch-action:manipulation;
}
.btn--sm { min-height:36px; padding:.35rem .65rem; font-size:var(--fs-xs); }
.btn--lg { min-height:52px; padding:.7rem 1.2rem; font-size:var(--fs-md); }
.btn--primary { background:var(--brand-gold-soft); color:var(--ink-on-gold); border-color:#ab8748; box-shadow:var(--sh-1); }
.btn--primary:hover:not(:disabled) { background:#e8c68a; }
.btn--secondary { background:var(--surface-card); color:var(--ink-default); border-color:var(--line-default); }
.btn--secondary:hover:not(:disabled) { background:var(--surface-sunken); border-color:var(--line-strong); }
.btn--ghost { background:transparent; color:var(--ink-muted); }
.btn--ghost:hover:not(:disabled) { background:var(--surface-sunken); color:var(--ink-strong); }
.btn--danger { background:var(--danger-bg); color:var(--danger); border-color:var(--danger-line); }
.btn:disabled { opacity:.5; cursor:not-allowed; }
```

**المكوّنات المقترحة:**

| المكوّن | يحلّ محل | الأثر |
|---|---|---|
| `Button` | 40+ تعريف زر مختلف | اتساق + `min-height` مضمون |
| `Field` (label+input+error+help) | تكرار `<label>`+`<input>`+`.field-error` | حفظ مفاتيح التحقق في مكان واحد |
| `Card` / `CardHeader` | `.visual-card` / `.record-card` / `.metric-card` / `.operation-surface` | نصف قطر وظل موحّدان |
| `Badge` (tone: ok/warn/danger/info) | `.record-badge` / `.section-count` / `.catalog-register-badge` | دلالات لونية موحّدة |
| `Tabs` | `.record-tabs` / `.catalog-status-tabs` / `.period-options` | سلوك موحّد + `aria` صحيح |
| `EmptyState` | `.section-empty` / `.chart-empty` / `.catalog-empty` / `.record-state` | 4 نسخ مختلفة لنفس الفكرة |
| `Stat` | `.metric-card` | أرقام `tabular-nums` + تنسيق موحّد |
| `Sheet`/`Drawer` | `.agouz-modal[data-layout=side]` | responsive panel موحّد |
| `Money` | `{amount} ج.م` مكرر | **تنسيق الأرقام المالية في مكان واحد** |

> **`Money` تحديدًا هو الأهم ماليًا.** كل شاشة تعرض المبلغ بنفس تنسيق مختلف. مكوّن واحد يضمن: `tabular-nums` + الأرقام العربية + `+`/`−` + الصفر بلون محايد.

---

## ٤. المحور الثالث — تحسينات تجربة المستخدم عالية الأثر

هذه أفكار **تغيّر طريقة الاستخدام**، لا مجرد المظهر.

### 4.1 🎯 «شاشة اليوم» — أهم شاشة في المشروع

**الملاحظة:** المشروع فيه 40+ شاشة. لا توجد شاشة واحدة تجيب على سؤال صاحب المحل: **«كيف حال المحل اليوم؟»**

**المقترح — شاشة `today` (أول عنصر في الشريط السفلي):**

```
┌─────────────────────────────────────────┐
│  اليوم · الأحد ١٥ نوفمبر      [تحديث]   │
├─────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │صندوق اليوم│ │مبيعات اليوم│ │صافي الربح │ │
│  │  ٤٬٢٥٠   │ │  ٨٬٩٠٠   │ │  ٣٬١٤٠   │ │
│  │ج.م        │ │ج.م ↑ ١٢٪  │ │ج.م ↑ ٨٪  │ │
│  └──────────┘ └──────────┘ └──────────┘ │
├─────────────────────────────────────────┤
│  ⚠ يحتاج انتباه (3)                     │
│  • ٥ أصناف تحت الحد الأدنى              │
│  • فاتورتان مستحقتان متأخرتان            │
│  • تقرير كاشير بانتظار المراجعة         │
├─────────────────────────────────────────┤
│  إدخال سريع                             │
│  [بيع]  [شراء]  [مصروف]  [تحصيل]      │
└─────────────────────────────────────────┘
```
**لماذا:** كل شيء في ERP مبالَغ في التعمّق. صاحب المحل يحتاج شاشة **قابلة للقراءة خلال 5 ثوانٍ** تقوده للمشكلة الفعلية. كل عنصر في «يحتاج انتباه» **قابل للنقر** ⇒ ينقل إلى الشاشة المعنيّة.

### 4.2 ⚡ «وضع الكاشير» — الشاشة الأكثر استخدامًا يوميًا

كاشير المقهى يفتح التطبيق 100+ مرة يوميًا على هاتف. من واقع الكود، تدفّق "رفع تقرير الكاشير" يمر بـ: `CashierUploadScreen` → `CashierRowReview` → `CashierDayScreen` → `CashierApprovalPreview`.

**المقترح — شاشة مخصصة، لا نموذج طويل:**

| العنصر |现状 | المقترح |
|---|---|---|
| إدخال الكمية | حقل نصّي | **لوحة أرقام كبيرة** + أزرار سريعة (×0.5, ×2, +1, −1) |
| اختيار الصنف | قائمة منسدلة | **بحث فوري مع صور** + آخر 10 أصناف |
| المراجعة | جدول | **بطاقات**، كل بطاقة: الاسم، الكمية، السعر، وقلم واحد لتعديل الكمية |
| التأكيد | زر في أسفل формы | **زر ثابت أسفل الشاشة** (thumb zone) + مراجعة سريعة |

**لوحة الأرقام** هي الفارق الحقيقي — على الهاتف، إدخال `2.5` باللمس أسرع من لوحة المفاتيح.

### 4.3 📌 شريط الإجراءات الثابت (Sticky Action Bar)

الملاحظة من الكود: `.invoice-summary` في `interaction-design.css:64` يستخدم `position:sticky; bottom:calc(70px + env(safe-area-inset-bottom))` — أي أن **شريط الإجراء السفلي idea موجودة بالفعل** لكن في موضع واحد فقط.

**المقترح — تعميمه:**
```css
.action-bar {
  position: sticky; bottom: calc(var(--nav-h) + env(safe-area-inset-bottom));
  z-index: 30;
  display: flex; align-items: center; justify-content: space-between; gap: .75rem;
  padding: .7rem .85rem;
  background: color-mix(in srgb, var(--surface-card) 92%, transparent);
  backdrop-filter: blur(12px);
  border: 1px solid var(--line-default); border-radius: var(--r-lg);
  box-shadow: var(--sh-2);
}
```
> **مهم في RTL:** تأكّد أن `left/right` في `sticky` ليست hard-coded — استخدم `inset-inline`.

### 4.4 🔍 لوحة الأوامر السريعة (⌘K / Ctrl+K)

53 شاشة = مستخدم يحتاج 3 نقرات للوصول لأي شاشة. لوحة أوامر تقطعها لنقرة واحدة:

```tsx
// src/components/CommandPalette.tsx
const COMMANDS = [
  { id:'sell',     label:'بيع جديد',        icon:ShoppingCart,  hint:'F2' },
  { id:'purchase', label:'فاتورة شراء',      icon:PackagePlus,  hint:'F4' },
  { id:'cashier',  label:'رفع تقرير كاشير',  icon:Upload,       hint:'F6' },
  { id:'expense',  label:'تسجيل مصروف',      icon:Receipt,      hint:'F8' },
  { id:'collect',  label:'تحصيل دفعة',       icon:Banknote,     hint:'F9' },
  { id:'catalog',  label:'الأصناف',          icon:Boxes },
  { id:'reports',  label:'التقارير',         icon:BarChart3 },
];
```
مع اختصارات لوحة المفاتيح (F2/F4/F6…) — **مختصرة ومناسبة لجهاز POS**.

### 4.5 📊 «الوضع الكثيف» للمحل

`catalog-register.css` يعرض كل صنف في صف كامل. في محل فيه 400 صنف، هذا 40 شاشة تمرير.

**المقترح — مفتاح تبديل «وضع كثيف»** يقفّر الجدول:
```css
[data-density="compact"] .catalog-register-row { padding: 6px 10px; gap: 6px; }
[data-density="compact"] .catalog-register-meta { display: none; }
[data-density="compact"] .catalog-register-row .catalog-register-details { display: none; }
```
يُحفظ الاختيار في `localStorage` ويؤثر على **كل** الجداول (`.responsive-register`، `.catalog-register`، سجل المبيعات) — لأن `.responsive-register` أصلًا يحوّل الصف إلى شبكة 2×N على الموبايل.

### 4.6 🌙 الوضع الليلي

`color-scheme: light` مقفل في `index.css:6`، و**صفر** إشارات `prefers-color-scheme` في المشروع.

**لماذا يهم:** مقهى يعمل حتى ٢ فجرًا، والعامل يستخدم الهاتف في إضاءة خافتة. في الوضع الفاتح الحالي، الشاشة **تقطع النظر**.

التنفيذ رخيص لأن التوكنز ستُعزل في `:root`:
```css
@media (prefers-color-scheme: dark) {
  :root {
    --surface-page:  #17110d;
    --surface-card:  #201812;
    --surface-sunken:#2a2018;
    --surface-raised:#332719;
    --ink-strong:    #f7ecd8;
    --ink-default:   #e0d2be;
    --ink-muted:     #ab9a85;
    --line-default:  #3b2f24;
    --line-strong:   #56452f;
    --brand-gold:    #d7ab5c;
    --brand-gold-soft:#e0bd77;
    /* … */
  }
}
```
> **شرط:** لا يبدأ قبل توحيد التوكنز (2.1). بدون توكنز موحّدة، الوضع الليلي = 397 قيمة تحتاج تعديل يدوي.

### 4.7 🧾 توحيد الفاتورة/الإيصال

`backend/assets/wholesale-invoice.html` + `src/lib/invoicePdf.ts` (jsPDF) + `ReceiptAndStatementModals.tsx` (print HTML) = **3 تطبيقات منفصلة لوثيقة واحدة**. النتيجة: اختلاف في الترقيم، الهوامش، وحجم الخط بين مسار آخر.

**المقترح:** مصدر واحد — `InvoiceDocument` كمكوّن يعرض نفس البنية، ثم:
- `print` من نفس الـ markup
- `PDF` من نفس الـ markup عبر `html2pdf`/WeasyPrint للـ backend
- لا تكرار

### 4.8 ♿ تحسين جدول الاستجابة (`.responsive-register`)

`record-system.css:32-43` يحوّل كل صف إلى شبكة **عمودين فقط** على الموبايل — أي أن صفًا من 6 خلايا يصير 3 صفوف. عند 30 صفًا = 90 كتلة مرئية.

**المقترح:**
- **عمودان + صف العنوان ملتصق** (sticky first column) للأعمدة المفتاحية (الاسم / التاريخ)
- طيّ الحقول الثانوية في `<details>` باسم «تفاصيل»
- أو **قائمة بطاقات** بدل الجدول على الموبايل (نفس نمط `catalog-register`)

### 4.9 🔴 حالة الحفظ — اجعلها مرئية

`storeEngine.ts` يدير حالات `ready/dirty/saving/error/conflict`، لكن **الواجهة لا تعرضها إلا عند الخطأ** (زر «إعادة محاولة الحفظ» في `App.tsx:994`).

**المقترح — شريط حالة ثابت أسفل الشريط الجانبي / أعلى الشريط السفلي:**
```
● متزامن            ○ جارٍ الحفظ…      ⚠ لم يُحفظ — اضغط للإعادة
```
مع **رمز preseve صغير** يغلق تلقائيًا بعد 2 ثانية. يمنع أكثر شكوى شائعة: «هل حُفظ؟».

> (مرتبط أمنيًا: H-01 من تقرير الثغرات — امتلاء `localStorage` يُسقط العملية. شريط الحالة يجعل ذلك مرئيًا بدل أن يكون خطأ غامضًا.)

---

## ٥. المحور الرابع — لمسات الهوية

### 5.1 ترويسة خطية عربية (اختياري)
`Amiri` مُضمّن بالفعل في `backend/assets/` للفاتورة! استخدمه:
```css
.brand-mark { font-family: 'Amiri', serif; letter-spacing: .02em; }
```
للعلامة فقط — لا للنص. يميّز الهوية بلا ضجيج.

### 5.2 نقش عربي خفيف كخلفية
```css
.sections-hero::after {
  content: 'العجوز';
  position: absolute; inset-inline-end: -1rem; bottom: -2.5rem;
  font-family: 'Amiri', serif; font-size: 8rem; line-height: 1;
  color: color-mix(in srgb, var(--brand-gold) 7%, transparent);
  transform: rotate(-8deg); pointer-events: none; user-select: none;
}
```
(`sections-hero::before` الحالي دائرة 240px — استبدلها بالنقش.)

### 5.3 تهدئة الحركة
- احذف `animate-gold-shimmer` من الاستخدام على **الأرقام** (`-webkit-text-fill-color:transparent` خطر قراءة).
- احذف `logo3dFloat` (منظور 3D + 5 keyframes) — branding ثابت يكفي.
- أبقي: `pageReveal` (200ms)، `dialogArrival`، `surfaceEnter`، pressed.

### 5.4 إدارة الكثافة
```css
:root { --density: comfortable; }               /* مريح */
[data-density="compact"] { --density: compact; } /* مضغوط */
```
يربطها بـ `--r-*` و `--fs-*` و padding عبر متغيّرات → تبديل واحد يغيّر الإحساس في كل التطبيق.

---

## ٦. خارطة التنفيذ المقترحة

### المرحلة ٠ — قياس (نصف يوم)
- [ ] تشغيل `visual regression` على 6 شاشات رئيسية (Chromium + `toHaveScreenshot`)
- [ ] تسجيل خط الأساس في `audit/visual-baseline/`
- بدون قياس، لا يمكن إثبات أن التوحيد حسّن شيئًا

### المرحلة ١ — التوحيد (٢–٣ أيام) ⭐ **الأعلى عائدًا**
- [ ] إنشاء `src/styles/tokens.css` بمحتوى §2.1
- [ ] استبدال كل `var(--…)` القديم بتوكنز موحّدة
- [ ] توحيد نقاط التوقف (§2.2) وإصلاح فجوة 1100–1199
- [ ] `750 → 700` و `850 → 800` (20 موضعًا)
- [ ] توحيد حلقات التركيز + شريط التمرير + `::selection`
- [ ] إصلاح `index.html` و`App.tsx:1059`
- [ ] **النتيجة:** 397 لون → ~60، 10 breakpoints → 4

### المرحلة ٢ — المكوّنات الأساسية (٣–٤ أيام)
- [ ] `Button` + `Field` + `Card` + `Badge` + `EmptyState` + `Money`
- [ ] ترحيل 3 شاشات مرجعية أولًا (لوحة التحكم + الكتالوج + شاشة بيع)
- [ ] قياس فرق CSS بعد الترحيل (يجب أن ينخفض 30%+)

### المرحلة ٣ — تجربة المستخدم (٤–٦ أيام)
- [ ] شاشة «اليوم» (§4.1)
- [ ] شريط الإجراءات الثابت (§4.3)
- [ ] لوحة الأوامر + اختصارات F-key (§4.4)
- [ ] وضع الكثافة (§4.5)
- [ ] improvements جدول الاستجابة (§4.8)
- [ ] شريط حالة الحفظ (§4.9)

### المرحلة ٤ — الوضع الليلي + لمسات (٢–٣ أيام)
- [ ] `prefers-color-scheme` block بعد توحيد التوكنز
- [ ] نقش عربي + Amiri للعلامة
- [ ] تهدئة الحركة

### المرحلة ٥ — توحيد المستند التجاري (٢–٣ أيام)
- [ ] `InvoiceDocument` كمصدر واحد للفاتورة (print + PDF + معاينة)

---

## ٧. مؤشرات النجاح

| المؤشر | قبل | بعد |
|---|---|---|
| قيم hex فريدة | 397 | < 70 |
| كتل `:root` | 4 متعارضة | 1 |
| نقاط التوقف | ~10 | 4 |
| أوزان خطوط خارج المتاح | 20 موضعًا | 0 |
| أسطر CSS | ~1,100 | ~700 (بعد الدمج + primitives) |
| زمن أول رسم للوحة التحكم | قياس | -25% |
| نقرات للوصول لـ «رفع تقرير كاشير» | 3 | 1 (⌘K) |
| استخدام الوضع الكثيف | — | يُقاس |

---

## ٨. ما **لا** ينبغي فعله

| ❌ لا تفعل | لماذا |
|---|---|
| لا تُغيّر لوحة الألوان | هي متّسقة ومميّزة؛ المشكلة في التكرار لا في الاختيار |
| لا تُغيّر الخط | Cairo مناسب، والمكتبة العربية (Amiri) متاحة للعلامة فقط |
| لا تعِد تصميم كل الشاشات | ترحيل تدريجي؛ المرحلتان ١-٢ تُصلحان 80% من الإحساس بالتفرّق |
| لا تُضف Motion Library | التطبيق كثيف الأرقام؛ الحركة الإضافية تُتعب العين |
| لا تبدأ بالوضع الليلي | قبل توحيد التوكنز = 397 قيمة تُعدَّل يدويًا |
| لا تنشئ مكتبة مكوّنات منفصلة (npm) | توكنز + 9 primitives محلية تكفي؛ حزمة خارجية تُضيف طبقة بناء |

---

## ٩. ملاحظة ختامية

**المشروع لا يحتاج «تصميمًا جديدًا» — يحتاج أن يُجمع ما هو موجود.**

الملفات الستة يتoverride بعضها لأن كل واحد كتب ما احتاجه من متغيّرات. الحل ليس إعادة كتابة، بل:
1. **ملف توكنز واحد** يحلّ 80% من التشويش
2. **نظام breakpoints من 4** يحلّ الفجوات المرئية
3. **9 مكوّنات أساسية** تحلّ تكرار الـ markup

و بعدها تأتي الأفكار_high-impact — «شاشة اليوم»، «وضع الكاشير»، «الوضع الكثيف» — وهي ما سيجعل التطبيق **أسرع في الاستخدام اليومي**، لا أجمل فقط.

> **الترتيب حاسم:** المرحلة ١ أولاً. بدونها، كل محاولة تحسين في المرحلة ٣-٤ ستبني على رمل.

---

## ١٠. سجل التنفيذ — المرحلة ١ (مكتملة ✅)

> نُفِّذت في `main` وتاريخها 2026-11-15. **تحقّق بصري** عبر `browse` على Chrome حقيقي + `tsc --noEmit` + `vitest` (330 ناجح، 0 فاشل) + `vite build`.

| # | البند | الحالة | الدليل |
|---|---|---|---|
| 1 | ملف `src/styles/tokens.css` — 32 لونًا + نظام radius/elevation/typography | ✅ | `src/styles/tokens.css` |
| 2 | `tokens.css` يُستورد **أولًا** في `main.tsx` | ✅ | `src/main.tsx:5` |
| 3 | حذف كتل `:root` المتعارضة (4 → 1) | ✅ | `visual-system`/`card-surfaces`/`interaction-design` |
| 4 | `--line` / `--espresso` / `--surface-radius` / `--surface-shadow` / `--control-line` / `--surface-inset` — قيمة واحدة لكل منها | ✅ | متحقَّق منها عبر `getComputedStyle` |
| 5 | نقاط التوقف **12 → 6** (380 / 767 / 768 / 950 / 1100 / 1200) | ✅ | `tmp` script + مراجعة يدوية |
| 6 | **إصلاح فجوة 1100–1199px** (الشريط الجانبي بلا شبكة عمودين) | ✅ | `(min-width:950px)` بدل `950–1099 + 1200` |
| 7 | أوزان الخطوط غير الموجودة `750`/`850` → `700`/`800` (20 موضعًا) | ✅ | `font-weight` sweep |
| 8 | حلقات التركيز: 5 تعريفات بـ 4 ذهبيات → **حلقة واحدة** | ✅ | `index.css` (unlayered) |
| 9 | `.eyebrow` معرَّف مرتين بذهبيين مختلفين → تعريف واحد | ✅ | `visual-system.css` |
| 10 | `index.html`: إزالة `bg-[#F4F6F9] text-slate-900 selection:bg-blue-600` | ✅ | `index.html:17` |
| 11 | `App.tsx`: `text-[#1E1612]` (رابع أسود) → رمز `--ink-strong` | ✅ | `App.tsx:1059` |
| 12 | شريط التمرير `slate` بارد → دافئ + `::selection` أزرق → ذهبي | ✅ | `index.css` |
| 13 | الشريط الجانبي `#38271b` المكتوب يدويًا → رمز | ✅ | `visual-system.css:87` |
| 14 | الشريط السفلي: حذف أصناف Tailwind الميتة (منها `yellow-500` `#D4AF37`) — CSS يملك الحالة | ✅ | `App.tsx:1787` |
| 15 | `border-radius`: 35 استعمالًا → رموز (بلا تغيير بصري) | ✅ | `var(--r-md/sm/xs/xl)` |
| 16 | `mobile-web-app-capable` (تحذير console) | ✅ | `index.html` |
| 17 | توحيد الأوزان في `tokens.css` (`--fw-*`) | ✅ | `tokens.css` §8 |

### القياس بعد التنفيذ

| المؤشر | قبل | بعد |
|---|---|---|
| كتل `:root` متعارضة | 4 | **1** |
| قيم hex في CSS | 397 | 335 (32 منها في `tokens.css`) |
| نقاط توقف مختلفة | 12 | **6** |
| أوزان خطوط خارج المتاح | 20 موضعًا | **0** |
| حلقات تركيز | 5 | **1** |
| أنصاف أقطار | 36 | 32 (35 استعمالًا برموز) |

### ما لم يُنفَّذ بعد (المرحلة ٢)
- **ترحيل 378 صنف Tailwind افتراضي** (`slate-*`/`amber-*`) إلى رموز دافئة —主要集中在 `ProductionAndRecipesScreen.tsx` (67) و`SalesAndCashierSyncScreens.tsx` (91) و`StocktakingAndStaffScreens.tsx` (75). **يحتاج تحقّقًا بصريًا بعد تسجيل الدخول.**
- **طبقة primitives** (9 مكوّنات) — لم تبدأ.
- **الوضع الليلي** — لم يبدأ (شرطه توحيد التوكنز، وقد تم ✅).
- **شاشة «اليوم» / وضع الكاشير / لوحة ⌘K** — لم تبدأ.

---

