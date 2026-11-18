# مراجعة نقاط الضعف في المشروع — تقرير شامل

**المشروع:** Agouz ERP (React + TypeScript + Vite + Supabase + Python/FastAPI)  
**نطاق المراجعة:** `src/` (الواجهة وطبقة البيانات) — `backend/` (الخادم والمعالِج) — `supabase/` (الصلاحيات وRLS والـ Edge Functions) — `scripts/backup/` (النسخ الاحتياطي)  
**التاريخ:** 2026-11-13

> **ملاحظة:** جميع النتائج الواردة في هذا التقرير تم التحقق منها مباشرةً من الشيفرة المصدرية الحالية، ومُرفقة بالملف ورقم السطر والحل العملي لكل نقطة.

---

## ملخص تنفيذي

المشروع مبني بصورة جيدة في أساسيات الأمان: لا توجد أسرار منشورة في المستودع، والتسجيل العام مغلق، وصلاحيات قاعدة البيانات محمية على الخادم (`RLS` + دوال `SECURITY DEFINER` مع `set search_path = ''`)، وطباعة الفواتير محصَّنة ضد XSS عبر `escapePrintData`.

في المقابل، توجد نقاط ضعف مؤثرة في أربعة مجالات رئيسية:

| المجال | التقييم | الملخص |
|---|---|---|
| 🔴 صحة الحسابات المالية والمخزون | **ضعيف** | أخطاء مباشرة في حساب كميات الكاشير، المرتجعات النقدية، والتقريب العشري |
| 🟠 مقاومة إساءة الاستخدام (DoS) | **ضعيف** | تعقيد `O(n²)` في تحليل تقارير UWS، غياب Rate Limiting، وتصفير عدّاد المحاولات |
| 🟡 متانة البيانات واستقرار الواجهة | **متوسط** | تعطل العمليات عند امتلاء `localStorage`، وتعليق شاشة التحميل/الجلسة في الحالات الحدّية |
| 🟢 أساسيات الأمان (RLS، الأسرار، XSS) | **جيد** | ضوابط صلبة مع فجوات محدودة في `audit_logs` وملفات النسخ الاحتياطي المحلية وCORS |

---

## أولًا: نقاط الضعف الحرجة (Critical) — تؤثر مباشرةً على صحة الحسابات والمخزون

### C-01 · قاعدة «نصف / ربع / ثمن» تضاعف أو تُنصّف كمية الكاشير بصمت
- **الملف والأسطر:** `src/lib/cashierRows.ts:164-194` و`src/lib/cashierRows.ts:258-273`
- **الشيفرة الحالية:**
  ```ts
  const unit = String(values.unit ?? '').trim().toLowerCase();
  const hint = `${unit} ${rawName}`;
  const pack = /ثمن|تمن/.test(hint)
    ? 0.125
    : /ربع/.test(hint)
      ? 0.25
      : /نصف|نص(?:\s|$)/.test(hint)
        ? 0.5
        : undefined;
  ...
  else if (pack && matchedItem?.baseUnit === 'kg') {
    unitHint = 'kg';
    quantity *= pack;
  }
  ```
- **المشكلة:**
  1. المتغير `hint` يدمج **عمود الوحدة** مع **اسم الصنف** (`rawName`). في تجارة البن والمكسرات قد يحتوي اسم الصنف نفسه على كلمات مثل «ربع خلطة» أو «نصف بن محوج». عند استيراد كمية `2 kg` لمثل هذا الصنف، تُضرب الكمية بصمت في `0.25` لتصبح `0.5 kg` (خصم مخزون ناقص بنسبة 75%).
  2. في دالة `reviewedCashierRows` (`src/lib/cashierRows.ts:270`)، عند المطابقة اليدوية يتم استدعاء `mapRawCashierRows` من جديد بالاسم والوحدة المختارة، مما قد يعيد تطبيق معامل الضرب على الكمية مرة أخرى.
- **الأثر:** تلف أرصدة المخزون، ومتوسط التكلفة المرجح (WAC)، وتكلفة البضاعة المباعة، وصافي الربح دون أي تنبيه مرئي للمراجع.
- **الحل:**
  ```ts
  // 1) استخراج المعامل من عمود الوحدة فقط (unit) دون اسم الصنف (rawName)
  const pack = /ثمن|تمن/.test(unit)
    ? 0.125
    : /ربع/.test(unit)
      ? 0.25
      : /نصف|نص(?:\s|$)/.test(unit)
        ? 0.5
        : undefined;

  // 2) إرجاع quantityFactor صراحةً وعرضه للمستخدم في شاشة المراجعة بدل التعديل الصامت
  // 3) في reviewedCashierRows: عدم إعادة التحليل من الصفر، بل تحديث الصنف والوحدة مع الحفاظ على base.quantity:
  return {
    ...base,
    matchedItem: selected,
    unitHint: choice.unit,
    error: undefined,
  };
  ```

---

### C-02 · مرتجع المبيعات قد يسجّل صرفًا نقديًا أكبر مما استُلم فعليًا من العميل
- **الملف والأسطر:** `src/lib/ledger.ts:96-100`، `src/lib/ledger.ts:145-156`، و`src/lib/financialOpening.ts:64`
- **الشيفرة الحالية:**
  ```ts
  const debtReversed = Math.min(invoice.remainingAmount, customer?.balance ?? 0);
  const refundAmount = Number((invoice.totalAmount - debtReversed).toFixed(2));
  ```
  ثم في `src/lib/financialOpening.ts:64` يُخصم `returnRefundAmount` مباشرةً كخروج نقدي من الخزنة:
  ```ts
  if (i.returnRefundAmount === undefined) issues.add('مرتجع قديم بلا مبلغ رد مؤكد');
  else cash(day, -cents(i.returnRefundAmount));
  ```
- **المشكلة:**
  إذا كان رصيد العميل المسجّل (`customer.balance`) أقل من `invoice.remainingAmount` (بسبب دفعة غير موزعة أو تسوية)، يصبح `refundAmount = totalAmount - debtReversed` **أكبر من `invoice.paidAmount`**. أي أن النظام يسجّل خروج نقدية من الخزنة أكبر مما دفعه العميل أصلًا. كما تبقى قيم `paidAmount` و`remainingAmount` على الفاتورة المرتجعة كما هي دون تصفير.
- **الحل:**
  ```ts
  // حساب الاسترداد النقدي بحد أقصى مما دُفع فعليًا على الفاتورة (الدفع المبدئي + الدفعات المخصصة لها)
  const refundAmount = Number(Math.min(invoice.totalAmount, actualPaidOnInvoice).toFixed(2));
  const creditNeeded = Number((invoice.totalAmount - refundAmount).toFixed(2));
  const debtReversed = Math.min(creditNeeded, customer?.balance ?? 0);
  if (refundAmount > actualPaidOnInvoice + 0.001) {
    throw new Error('المبلغ المسترد أكبر من المدفوع فعليًا على الفاتورة');
  }
  ```
  مع تصفير `remainingAmount` على الفاتورة المرتجعة وتسجيل أي فرق ائتماني بشكل صريح.

---

## ثانيًا: نقاط الضعف العالية (High) — توقف الخدمة (DoS)، فقدان العمليات، وتعليق الواجهة

### H-01 · امتلاء `localStorage` يُسقط جميع عمليات الحفظ والمحاسبة
- **الملفات والأسطر:** `src/lib/storeEngine.ts:121-123`، `src/lib/recoveryDraft.ts:5-20`، و`src/lib/costing.ts:11`
- **الشيفرة الحالية:**
  ```ts
  // storeEngine.ts
  const validated = validateStore(state);
  this.preserve(validated); // يرمي استثناءً عند امتلاء localStorage قبل حفظ pending
  ```
- **المشكلة:**
  دالة `saveRecoveryDraft` تكتب كامل حالة المتجر في `localStorage` (سعته التقريبية ~5 MB) عند كل تعديل، ومع نمو سجل `costHistory` ومصفوفات `inventoryBefore`/`inventoryAfter` بلا سقف، يمتلئ التخزين المحلي ويرمي استثناءً يُفشل العملية كلها قبل إرسالها إلى الخادم.
- **الحل:**
  1. تغليف `this.preserve(validated)` داخل `try / catch` في `storeEngine.ts` لتعيين علم تحذيري (`draftDegraded`) في الواجهة دون إسقاط العملية أو منع الحفظ السحابي.
  2. استدعاء `clearRecoveryDraft(localStorage)` تلقائيًا بعد نجاح الحفظ السحابي في `flushOnce()`.
  3. تقليم `costHistory` لكل صنف أو نقله إلى جدول سجل تاريخي منفصل على الخادم.

---

### H-02 · تعقيد تربيعي $O(n^2)$ في محلّل تقارير أصناف UWS (ReDoS)
- **الملف والأسطر:** `backend/uws_items.py:58, 67-68` و`backend/parser.py:64`
- **الشيفرة الحالية:**
  ```python
  item = re.fullmatch(r'(\d{4,20})\s+(.+?)\s+(\d+(?:\.\d+)?)\s+\d+(?:\.\d+)?%', line)
  money = re.fullmatch(r'(-?[\d,]+\.\d{2})\s+\d+(?:\.\d+)?%', line)
  weight = re.fullmatch(r'([\d,]+(?:\.\d+)?)\s+KG\s+\d+(?:\.\d+)?%', line, re.I)
  ```
- **المشكلة:**
  الجمع بين `(.+?)` و`\s+` متبوعين بأرقام وعلامة `%` إلزامية يسبب تراجعًا أسيًا/تربيعيًا (Backtracking) عندما تكون الخلية طويلة (حتى 2000 حرف حسب `parser.py:64`) وتحتوي أرقامًا ومسافات متكررة بدون `%` في النهاية، مما قد يجمّد خيط المعالجة عند رفع ملف مصمم أو تالف.
- **الحل:**
  ```python
  if len(line) > 300:
      raise invalid('UWS_UNRECOGNIZED_LINE')
  item = re.fullmatch(r'(\d{4,20})\s+([^\r\n%]{1,200}?)\s+(\d+(?:\.\d+)?)\s+\d+(?:\.\d+)?%', line)
  ```
  واستخدام أنماط غير متداخلة لـ `money` و`weight`.

---

### H-03 · تصفير عدّاد المحاولات `attempt = 0` يسمح بتكرار معالجة الملفات بلا سقف
- **الملفات والأسطر:** `supabase/migrations/20261104005900_online_cashier_import_jobs.sql:67-69, 81` و`backend/main.py:41-77`
- **الشيفرة الحالية:**
  ```sql
  -- داخل bon_erp_private.prepare_import
  if job.status in ('uploading','failed') or ... then
    update bon_erp_private.import_jobs
    set status='queued', worker_token=..., download_token=p_token, attempt=0, ...
  ```
- **المشكلة:**
  إعادة تعيين `attempt = 0` في `prepare_import` تُبطل فعليًا سقف المحاولات (`if job.attempt >= 3`) المطبَّق في `claim_import`. ولا يوجد Rate Limit على `POST /api/imports/{job_id}/enqueue` في `backend/main.py`، ما يسمح بإعادة تنزيل ومعالجة ملف بحجم 10 MB بصورة متكررة بلا حد.
- **الحل:**
  1. إزالة `attempt = 0` من `prepare_import` ورفض إعادة التشغيل عند `job.attempt >= 3` برسالة `IMPORT_RETRIES_EXHAUSTED`.
  2. فرض فترة تهدئة (Cooldown) مثل 30 ثانية لكل `job_id` على مستوى الخادم وقاعدة البيانات.

---

### H-04 · شاشة تحميل دائمة عند استدعاء `engine.load()` أثناء الحفظ
- **الملفات والأسطر:** `src/lib/storeEngine.ts:65-68`، `src/hooks/useErpStore.ts:180-181`، و`src/App.tsx:1011`
- **الشيفرة الحالية:**
  ```ts
  async load() {
    clearTimeout(this.timer);
    if (this.snapshot.status === 'saving')
      throw new Error('انتظر انتهاء الحفظ'); // خارج try / catch
  ```
- **المشكلة:**
  عند استدعاء `engine.load()` أثناء `status === 'saving'`، يرفض الـ Promise خارج `try / catch`. وفي `useErpStore.ts:181` يُستدعى `void hydrate()` بدون `.catch()` (وكذلك `void engine.load()` في `App.tsx:1011`)، فيبقى `hydrationKey` غير مضبوط ويعلق التطبيق على `<ScreenLoading />`.
- **الحل:**
  نقل التحقق إلى داخل `try / catch` أو نشر حالة الخطأ بدل رمي استثناء غير معالج، مع إضافة `.catch()` في `hydrate()` و`App.tsx`.

---

### H-05 · مؤقّت التحقق من الجلسة (كل 15 ثانية) يلغي الطلب الجاري على الشبكات البطيئة
- **الملف والأسطر:** `src/hooks/useErpStore.ts:98-144`
- **الشيفرة الحالية:**
  ```ts
  const resolveUser = async () => {
    const run = ++generation.current;
    try {
      const { data: { user }, error } = await sb.auth.getUser();
      if (disposed || run !== generation.current) return;
  ...
  const accessTimer = setInterval(() => {
    if (document.visibilityState !== 'hidden' && navigator.onLine) void resolveUser();
  }, 15000);
  ```
- **المشكلة:**
  إذا استغرق `sb.auth.getUser()` أو `bon_erp_my_access` أكثر من 15 ثانية على اتصال بطيء، يبدأ المؤقّت نداءً جديدًا يرفع `generation.current` فتُهمَل استجابة النداء الجاري (`run !== generation.current`)، مما قد يترك التطبيق عالقًا على «جارٍ التحقق من الجلسة…».
- **الحل:**
  استخدام قفل مستقل للنداء الجاري (`const resolvingRef = useRef(false)`) لمنع تداخل المؤقّت مع فحصٍ ما زال قيد التنفيذ، وقصر زيادة `generation.current` على أحداث تغيّر المصادقة (`SIGNED_OUT` / `PASSWORD_RECOVERY`).

---

### H-06 · تفاوت قيود التحقق بين العميل والخادم (الكميات والمبالغ الصفرية)
- **الملفات والأسطر:** `src/lib/storeState.ts:130-143, 206-216, 263-281, 381-397` مقابل `supabase/migrations/20261101204556_server_store_validation.sql:1633, 1639, 1672, 1702`
- **المشكلة:**
  مخطط Zod في العميل يستخدم `money` (`number.nonnegative()` أي يسمح بالصفر `0`) في `salesInvoices[].items[].quantity` و`normalizedQtyInBaseUnit` و`purchaseInvoices[].items[].quantity` و`expenses[].amount` و`accountPayments[].amount`، بينما يشترط الخادم في `validate_payload` أن تكون جميعها `> 0`. هذا التفاوت قد يسمح بدخول حالة محلية يرفضها الخادم عند المزامنة.
- **الحل:**
  استخدام `number.positive()` في `src/lib/storeState.ts` لجميع الحقول التي يشترط الخادم أن تكون أكبر من صفر.

---

### H-07 · استدعاء `validateStore` بتعقيد $O(n^2)$ عند كل تعديل في الحالة
- **الملف والأسطر:** `src/lib/storeState.ts:429-497`
- **المشكلة:**
  داخل `validateStore`، يتم استدعاء `parsed.items.find(...)` و`parsed.expenses.find(...)` داخل حلقات متداخلة (فحص أيام الكاشير، حركات العمال، والوصفات) وداخل الدالة العودية `walk(id)`، مما يرفع التعقيد إلى $O(n^2)$ مع تزايد عدد الأصناف والسجلات على كل `engine.replace()`.
- **الحل:**
  بناء فهارس `Map` مرة واحدة في بداية `validateStore`:
  ```ts
  const itemById = new Map(parsed.items.map((item) => [item.id, item]));
  const expenseById = new Map(parsed.expenses.map((expense) => [expense.id, expense]));
  ```
  واستبدال جميع نداءات `.find()` بـ `.get()`، مع تحويل `walk` إلى مكدس صريح (Iterative DFS) لتجنب تجاوز عمق الاستدعاء.

---

## ثالثًا: نقاط الضعف المتوسطة (Medium) — الأمان، الدقة المالية، والاعتمادية

### M-01 · سجل المراجعة `audit_logs` غير محمي كـ Append-Only للمستخدمين الفرعيين
- **الملفات والأسطر:** `src/lib/userAccess.ts:53` و`supabase/migrations/20261103151507_separate_user_accounts.sql:110-134`
- **المشكلة:**
  الدالة `check_user_store_access()` في قاعدة البيانات تتحقق من صلاحيات 8 مصفوفات أعمال بالإضافة إلى `items`, `suppliers`, `customers`, `expenses`, `partners`, `shifts`، لكنها لا تحمي `audit_logs`. وبالتالي يمكن لأي مستخدم يملك صلاحية كتابة واحدة (مثل `contacts`) حذف أو تعديل سجلات المراجعة السابقة عند إرسال حمولة `bon_erp_save_store`.
- **الحل:**
  فرض قاعدة Append-Only على `audit_logs` لغير المالك الرئيسي في `check_user_store_access()` و`assertUserChanges()`: التحقق من أن جميع سجلات `old.audit_logs` باقية دون حذف أو تعديل داخل `new.audit_logs`.

---

### M-02 · بقاء ملفات النسخ الاحتياطي غير المشفّرة (`vault-secrets.json` و`database.dump`) على القرص المحلي
- **الملفات والأسطر:** `scripts/backup/export-full.mjs:71-101` و`scripts/backup/run-daily.mjs:11-29`
- **المشكلة:**
  أثناء إنشاء النسخة الاحتياطية اليومية، تُحفظ أسرار Vault مفكوكة التشفير (`vault-secrets.json`) وتفريغ قاعدة البيانات الكامل (`database.dump`) والأرشيف غير المشفر (`archive.tar.gz`) داخل مجلد `pending/<generation>`. وبعد التحقق من النسخة المشفرة ورفعها، لا يتم حذف هذه الملفات الصريحة من القرص.
- **الحل:**
  حذف الملفات غير المشفّرة (`vault-secrets.json`، `database.dump`، `roles.sql`، `archive.tar.gz`، `downloaded.tar.gz`) فور تأكيد التحقق من التشفير في `export-full.mjs`، وتنظيف مجلد العمل المؤقت داخل `finally` في `run-daily.mjs`.

---

### M-03 · تخطّي فحص تطابق التاريخ في التقرير المالي (Begun) إذا خلا الملف من سطر `Date Range`
- **الملف والأسطر:** `backend/financial_report.py:58-60`
- **الشيفرة الحالية:**
  ```python
  business_date = periods[0] if periods else None
  if expected_date and business_date and expected_date != business_date:
      raise invalid('BEGUN_REPORT_DATE_MISMATCH')
  ```
- **المشكلة:**
  إذا لم يحتوِ التقرير على سطر `Date Range`، تصبح قيمة `business_date` هي `None`، فيتجاوز الشرط فحص عدم التطابق ويُقبل الملف لأي يوم محاسبي مختار.
- **الحل:**
  إلزام وجود التاريخ داخل الملف (كما في `uws_items.py`):
  ```python
  if not periods or len(set(periods)) != 1:
      raise invalid('BEGUN_REPORT_DATE_INVALID')
  ```

---

### M-04 · أخطاء التقريب العشري (`toFixed(2)`) وعدم تقريب ربح السطر في شاشة الجملة
- **الملفات والأسطر:** `src/lib/ledger.ts:7, 420-426`، `src/components/WholesaleInvoiceScreen.tsx:79`، و`src/components/SalesAndCashierSyncScreens.tsx:159-164`
- **المشكلة:**
  1. `Number(value.toFixed(2))` يعتمد على التقريب الثنائي لـ IEEE-754 مما يقرّب قيمًا مثل `1.005` إلى `1.00` بدل `1.01`.
  2. في `WholesaleInvoiceScreen.tsx:79` يُسجّل `profit: totalPrice - totalCost` دون تقريب، ما قد يترك أرقامًا مثل `14.200000000000003` في الفاتورة المخزنة.
  3. في `operatingExpenses` (`ledger.ts:420-426`) يتم التقريب بعد كل عنصر داخل `reduce` مما قد يراكم خطأ التقريب حسب ترتيب العناصر.
- **الحل:**
  إنشاء وحدة `src/lib/money.ts` موحّدة بالوحدات الصحيحة (القروش باستخدام `BigInt` كما في `src/lib/financialOpening.ts:6-11`)، وتقريب جميع مجاميع الفواتير والربح عند الحدود مرة واحدة.

---

### M-05 · حساب الإجمالي والـ Hash في `cashierSourceId` يستخدم الكمية قبل تحويل الجرام/المللي
- **الملف والأسطر:** `src/lib/cashierRows.ts:234-245`
- **الشيفرة الحالية:**
  ```ts
  quantity: Number((['gram', 'ml'].includes(r.unitHint) ? r.quantity / 1000 : r.quantity).toFixed(6)),
  total: r.totalPrice ?? (r.unitPrice !== undefined ? Number((r.unitPrice * r.quantity).toFixed(2)) : null),
  ```
- **المشكلة:**
  عندما يعتمد السطر على `unitPrice` مع وحدة `gram` أو `ml`، يُقسم حقل `quantity` على `1000` بينما يُضرب `r.unitPrice` في `r.quantity` غير المطبّعة (أكبر بـ 1000×)، مما يغيّر قيمة الـ Hash ويُفشل كشف التكرار.
- **الحل:**
  حساب الكمية المطبّعة في متغير واحد `normalizedQty` واستخدامها في حساب كلٍّ من `quantity` و`total`.

---

### M-06 · التباس الفاصلة في الأرقام مثل `"1,500"` في `parseLocalizedNumber`
- **الملفات والأسطر:** `src/lib/cashierRows.ts:30-31` و`backend/parser.py:43-46`
- **المشكلة:**
  النص `"1,500"` يطابق `/^-?\d{1,3}(,\d{3})+(\.\d+)?$/` فيُفسّر دائمًا كـ `1500` حتى لو كان صادرًا من نظام يكتب `1.500` كجم بالفاصلة العشرية الأوروبية/العربية.
- **الحل:**
  عند وجود عمود الإجمالي وسعر الوحدة، التحقق من الاتساق (`total ≈ qty × price`) لاختيار التفسير الصحيح، أو إظهار تحذير مراجعة عند التباس صيغة `"x,xxx"`.

---

### M-07 · متوسط التكلفة المرجح (WAC) يتجاهل الرصيد السالب عند ورود مشتريات جديدة
- **الملف والأسطر:** `src/lib/costing.ts:3-7`
- **الشيفرة الحالية:**
  ```ts
  const valuedStock = Math.max(0, stock);
  return Number(((valuedStock * oldCost + received * unitCost) / (valuedStock + received)).toFixed(2));
  ```
- **المشكلة:**
  بما أن نظام الكاشير يسمح ببيع المخزون بالعجز (`allowNegative: true` في `cashierDays.ts:25`)، فإن تصفير `stock` السالب عند الشراء الجديد يُسقط أثر الكمية المباعة مسبقًا على التكلفة القديمة، ثم يُقيّم الرصيد الصافي بالكامل بسعر الشراء الجديد دون تسوية فرق العجز.
- **الحل:**
  الاحتفاظ بتكلفة العجز وتسويتها بوضوح عند استلام المشتريات (تسجيل فرق التكلفة في قيد تسوية منفصل أو احتساب المتوسط على الصافي الموجب بعد خصم العجز).

---

### M-08 · عدم وجود إعادة محاولة تلقائية عند فشل الحفظ العابر وقفل إرفاق تقارير الكاشير
- **الملف والأسطر:** `src/lib/storeEngine.ts:115-119, 241-254`
- **المشكلة:**
  1. عند فشل الشبكة أثناء `flushOnce()`، يتوقف المحرك على حالة `error` ولا يعيد المحاولة تلقائيًا رغم وجود `operationId` في الخادم لدعم Idempotency.
  2. إذا فشل حفظ إرفاق تقرير كاشير، يبقى `this.pending.queueId` محجوزًا، ما يمنع المستخدم من إرفاق أي تقرير آخر برسالة «انتظر تأكيد حفظ تقرير الكاشير الحالي».
- **الحل:**
  تطبيق إعادة محاولة تلقائية بفاصل متصاعد (Exponential Backoff: مثلًا 2s، 4s، 8s) بنفس `operationId` للأخطاء غير التعارضية، والسماح باستبدال أو إلغاء مسودة الإرفاق الفاشلة عندما تكون الحالة `error`.

---

### M-09 · ضياع سبب الخطأ الحقيقي في الخادم وتصنيف أخطاء البيانات كـ `503` وسلوك الـ Middleware
- **الملفات والأسطر:** `backend/main.py:14-33, 75-77, 118-139` و`backend/pdf_reports.py:85-91`
- **المشكلة:**
  1. استدعاء `logger.warning(...)` بدون `exc_info=True` أو `logger.exception(...)` يضيع الـ Traceback من سجلات التشغيل.
  2. أخطاء البيانات الحتمية (`ValueError` مثل `INVOICE_TOTAL_MISMATCH` و`PDF_ROW_LIMIT` و`EXPORT_ROW_LIMIT`) تُلتقط داخل `except Exception:` وتُرجع كـ `503 EXPORT_NOT_CONFIRMED` بدل `422`.
  3. في `private_responses` middleware: ردود الرفض المبكرة (400/413) لا تضيف ترويسات `Cache-Control: no-store` و`X-Content-Type-Options: nosniff`، والتجميع يتم عبر `body += chunk`، ثم يُحقن `request._body = body` وهي خاصية داخلية غير موثّقة في Starlette.
- **الحل:**
  استخدام `logger.exception(...)`، وإرجاع `422` لأخطاء `ValueError` الدائمة وحصر `503` بالأعطال العابرة، وتجميع الطلب بـ `b"".join(chunks)` مع استخدام `await request.body()` أو ASGI middleware قياسي، وتمرير جميع الردود عبر دالة موحّدة تضيف ترويسات الأمان.

---

### M-10 · عدم وجود Rate Limiting على نقاط تصدير التقارير والفواتير
- **الملف والأسطر:** `backend/main.py:98-139`
- **المشكلة:**
  نقطتا `/api/reports/{format}` و`/api/invoices/{invoice_id}/pdf` تشغّلان استعلامات SQL وبناء ملفات Excel/PDF (Polars + WeasyPrint) دون حد أقصى لمعدل الطلبات لكل مستخدم أو حد للتوازي.
- **الحل:**
  إضافة Rate Limiter لكل مستخدم (مثلًا 10 طلبات / 5 دقائق) واستخدام `asyncio.Semaphore` لتحديد التوازي في توليد ملفات PDF/Excel.

---

### M-11 · نقاط صلاحيات وتحقق إضافية
1. **تسريب بيانات حالة النسخ الاحتياطي لكل شريك (`20261104011927_recovery_health_and_import_monitor.sql:20-29`):**  
   قراءة `bon_erp_private.recovery_health` تقع خارج شرط `if bon_erp_private.import_allowed(auth.uid(), true)`، فيراها أي شريك بصلاحية عرض فقط. **الحل:** قصرها على المالك (`bon_erp_private.is_master(auth.uid())`) أو من لديهم صلاحية إدارة.
2. **نطاق CORS واسع في دالة المستخدمين (`supabase/functions/manage-users/handler.ts:7`):**  
   النمط `/^https:\/\/agouz-[a-z0-9-]+-alagoouz\.vercel\.app$/` يقبل أي نطاق فرعي يبدأ بـ `agouz-` وينتهي بـ `-alagoouz.vercel.app`. **الحل:** إزالة الـ wildcard والاكتفاء بقائمة `AGOUZ_ALLOWED_ORIGINS` الصريحة.
3. **التحقق من مسار الاستيراد في موضع واحد (`backend/main.py:53` مقابل `backend/clients.py:45-59`):**  
   التعبير `[a-f0-9-]{36}` في `main.py` لا يتحقق من بنية UUID القياسية، بينما `clients.download()` و`worker.py` لا يتحققان من المسار إطلاقًا. **الحل:** نقل تحقق UUID الصارم (`[0-9a-f]{8}-[0-9a-f]{4}-...`) إلى دالة مشتركة داخل `clients.py`.
4. **تعميم رسائل أخطاء الخادم (`src/lib/storeErrors.ts:15`):**  
   الشرط `/INVALID_STORE_SCHEMA|INVALID_BUSINESS_DATE|DUPLICATE_|_MISMATCH|_REQUIRED|INVALID_/` يبتلع رموزًا دقيقة مثل `STORE_TOO_LARGE` أو `RECIPE_CYCLE_OR_DEPTH` (أو يمررها كنص خام). **الحل:** إضافة خريطة `Record<string, string>` صريحة لكل أكواد الخادم.

---

## رابعًا: نقاط الضعف المنخفضة والتحسينات (Low)

| # | الملف والأسطر | المشكلة | الحل المقترح |
|---|---|---|---|
| **L-01** | `src/lib/invoicePdf.ts:21-29` | مُولّد PDF المحلي الاحتياطي يثبّت عنوان `'الكمية (كجم)'` ويطبع `normalizedQtyInBaseUnit` مع `unitPrice` دون مراعاة اختلاف الوحدة، ويستخدم `jsPDF` مباشرةً دون تشكيل عربي | إزالة الملف إن لم يعد مستخدمًا بعد تفعيل `backend/pdf_reports.py`، أو توحيد حساب الوحدة وإصلاح العرض |
| **L-02** | `vercel.json:2-12` | غياب ترويسات `Strict-Transport-Security` (HSTS) و`Content-Security-Policy` (CSP) | إضافتهما إلى `headers[0].headers` في `vercel.json` |
| **L-03** | `backend/pyproject.toml` و`backend/requirements.txt` | اختلاف قائمة التبعيات الصريحة بين `pyproject.toml` (المستخدم في Vercel) و`requirements.txt` | توليد `requirements.txt` أو مواءمته صراحةً مع `pyproject.toml` لضمان تطابق بيئة الاختبار والنشر |
| **L-04** | `src/lib/legacyCache.ts:8` | `JSON.parse(raw)` بدون `try / catch` قد يعطّل بدء التحقق من الجلسة إذا وُجدت بيانات قديمة تالفة في `localStorage` | إحاطة `JSON.parse` بـ `try / catch` وإرجاع `false` بأمان عند تلف البيانات |
| **L-05** | `supabase/migrations/20261102033848_readonly_storage_backup_principal.sql:15-19` | سياسات قراءة Storage لحساب النسخ الاحتياطي تسمح بالقراءة عبر كل الـ buckets دون تقييد | تقييد السياسات بـ `bucket_id` محددة فقط إن لزم، أو توثيق شمولها لجميع الـ buckets المطلوبة للنسخ |

---

## خامسًا: نقاط القوة الأمنية والمعمارية الموجودة (يجب الحفاظ عليها)

1. **لا أسرار في المستودع:** ملف `.env.local` خارج Git و`.gitignore` يحمي `.env*` مع إبقاء `.env.example` كقالب.
2. **عزل مفتاح `service_role`:** لا يصل إلى المتصفح أبدًا ويُستخدم فقط في Deno Edge Function لإنشاء/حذف المستخدمين عبر `auth.admin`.
3. **حماية قاعدة البيانات:** جميع الدوال الحساسة `SECURITY DEFINER` تستخدم `set search_path = ''` مع منع الكتابة المباشرة على الجداول وإعادة فحص الصلاحيات في الـ Triggers.
4. **قفل تفاؤلي ومنع التكرار:** حفظ المتجر محمي بـ `version` و`operationId` في `bon_erp_save_store`.
5. **إغلاق التسجيل العام ومنع تعداد الحسابات:** غياب `signUp` في الواجهة وتوحيد رسائل الخطأ عند تسجيل الدخول والاستعادة.
6. **طباعة آمنة ومستندات محصّنة:** استخدام `escapePrintData` في `safeHtml.ts` عند الطباعة المباشرة، وفحص أمان ملفات الاستيراد في `parser.py` ضد Zip Bombs وXXE وSSRF (في `pdf_reports.py`).
7. **حسابات `BigInt` في `financialOpening.ts`:** نموذج سليم يجب تعميمه على بقية الحسابات المالية.

---

## سادسًا: خطة العمل المقترحة للتنفيذ

يمكن تنفيذ الإصلاحات على **4 مراحل متتالية** مع تشغيل الاختبارات (`npm test` و`pytest`) بعد كل مرحلة:

1. **المرحلة الأولى (الحسابات المالية والمخزون):**
   - إصلاح `C-01` و`M-05` و`M-06` في `src/lib/cashierRows.ts`.
   - إصلاح `C-02` في `src/lib/ledger.ts`.
   - إنشاء `src/lib/money.ts` وتوحيد التقريب (`M-04`) ومعالجة الرصيد السالب في `src/lib/costing.ts` (`M-07`).
2. **المرحلة الثانية (متانة الواجهة ومزامنة المتجر):**
   - حماية `localStorage` وتنظيف المسودة (`H-01`)، وإصلاح `load()` (`H-04`)، وإضافة إعادة المحاولة التلقائية وفك قفل الكاشير (`M-08`) في `storeEngine.ts`.
   - إضافة حارس `resolvingRef` في `useErpStore.ts` (`H-05`) وحماية `legacyCache.ts` (`L-04`).
   - مطابقة قيود `storeState.ts` مع الخادم (`H-06`)، وتسريع `validateStore` عبر `Map` (`H-07`)، وتوسيع `storeErrors.ts` (`M-11`).
3. **المرحلة الثالثة (الخادم الخلفي `backend`):**
   - إصلاح التعبير النمطي في `uws_items.py` (`H-02`) وإلزام التاريخ في `financial_report.py` (`M-03`).
   - تحسين `private_responses` وتصنيف الأخطاء `422`/`503` وتسجيلها في `main.py` (`M-09`)، وإضافة Rate Limiting (`M-10`)، وتشديد فحص المسار في `clients.py` (`M-11`).
4. **المرحلة الرابعة (قاعدة البيانات، الأمان، والنسخ الاحتياطي):**
   - ترقية SQL لحماية `audit_logs` (`M-01`)، ومنع تصفير `attempt` في `prepare_import` (`H-03`)، وتقييد `recovery_health` (`M-11`).
   - حذف الملفات غير المشفرة بعد نجاح التشفير في `scripts/backup/` (`M-02`)، وتضييق CORS في `manage-users` (`M-11`)، وإضافة `HSTS`/`CSP` في `vercel.json` (`L-02`).
