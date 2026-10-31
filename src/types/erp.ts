export type UnitType = 'kg' | 'gram' | 'piece' | 'liter' | 'ml';

export type ItemCategory =
  | 'raw_bean'          // حبوب بن محمصة خام (تُباع مباشرة وتدخل في التوليفات)
  | 'raw_spice'         // تحويجة وإضافات (حبهان، مستكة، جوزة الطيب، لبن، سكر، أكواب...)
  | 'manufactured_blend'// توليفات بن مصنعة في قسم الإنتاج (لها وصفة ولها رصيد جاهز بالكيلو/جرام)
  | 'drink_recipe'      // مشروبات محضرة بوصفة لحظية (تخصم مكوناتها مباشرة عند البيع بالعدد)
  | 'direct_product';   // منتجات بيع مباشر بالعدد (مياه معدنية، مشروبات معلبة...)

export interface RecipeIngredient {
  ingredientId: string;
  ingredientName: string;
  quantity: number;      // الكمية المطلوبة لكل 1 وحدة من المنتج (مثلاً بالجرام لكل 1 كجم توليفة، أو بالجرام/قطعة لكل 1 كوب مشروب)
  unit: UnitType;
}

export interface SupplierPriceRecord {
  supplierId: string;
  supplierName: string;
  price: number;         // سعر الوحدة الأساسية (مثلاً سعر الكيلو أو القطعة)
  date: string;
  invoiceId?: string;
}

export interface InventoryItem {
  id: string;
  code: string;
  barcode?: string;
  name: string;
  category: ItemCategory;
  roastLevel?: 'فاتح' | 'وسط' | 'غامق' | 'إسبريسو' | 'بدون';
  baseUnit: 'kg' | 'piece' | 'liter';
  stock: number;
  minStock: number;
  costPrice: number;
  lastPurchasePrice: number;
  retailPrice: number;
  wholesalePrice: number;
  canSellDirectly: boolean;
  hasRecipe: boolean;
  recipeYield?: number;
  recipe?: RecipeIngredient[];
  supplierPrices: SupplierPriceRecord[];
  lastSoldDate?: string;
}

export interface ProductionBatch {
  id: string;
  batchNumber: string;
  date: string;
  blendId: string;
  blendName: string;
  quantityProducedKg: number;
  unitCostPerKg: number;
  totalBatchCost: number;
  ingredientsConsumed: {
    ingredientId: string;
    ingredientName: string;
    quantityUsed: number;
    displayQuantity: string;
    cost: number;
  }[];
  partnerName: string;
  notes?: string;
}

export interface PurchaseInvoiceItem {
  itemId: string;
  itemName: string;
  quantity: number;
  unit: string;
  purchasePrice: number;
  newRetailPrice?: number;
  newWholesalePrice?: number;
  previousLastPrice: number;
  previousWacCost: number;
  cheapestSupplierPrice: number;
  cheapestSupplierName: string;
  updateProductCost: boolean;
}

export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseInvoiceItem[];
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: 'نقدي' | 'آجل' | 'جزئي';
  partnerName: string;
  notes?: string;
}

export interface SalesInvoiceItem {
  itemId: string;
  itemName: string;
  category: ItemCategory;
  quantity: number;
  unitLabel: string;
  normalizedQtyInBaseUnit: number;
  unitPrice: number;
  unitCost: number;
  totalPrice: number;
  totalCost: number;
  profit: number;
  deductionDetails?: string;
}

export interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  saleType: 'retail' | 'wholesale' | 'cashier_sync';
  customerId?: string;
  customerName: string;
  items: SalesInvoiceItem[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  totalCost: number;
  netProfit: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: 'نقدي' | 'آجل' | 'محفظة/انستا باي';
  partnerName: string;
  sourceFile?: string;
  isReturned?: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  category: string;
  balance: number;
  totalPurchases: number;
  invoicesCount: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  type: 'جملة - كافيه' | 'جملة - سوبر ماركت' | 'جملة - تاجر' | 'عميل محل';
  balance: number;
  totalSales: number;
  invoicesCount: number;
  specialDiscountPercent?: number;
  lastPurchaseDate?: string;
}

export interface Expense {
  id: string;
  date: string;
  category: 'إيجار' | 'كهرباء ومياه وغاز' | 'رواتب ويوميات' | 'صيانة مطاحن وماكينات' | 'أكياس وتغليف' | 'نقل ومشال' | 'مسحوبات شركاء' | 'نثريات أخرى';
  title: string;
  amount: number;
  partnerName: string;
  paidFrom: 'درج المحل' | 'خزنة الشركة' | 'من جيب الشريك';
  notes?: string;
}

export interface Partner {
  id: string;
  username: string;                   // اسم المستخدم للدخول (مثلاً owner1)
  password: string;                   // كلمة المرور الخاصة بالشريك
  name: string;                       // الاسم الكامل للشريك المالك
  role: string;                       // المسمى والاختصاص
  avatarLetter: string;
  phone: string;
  sharePercent: number;               // نسبة الشراكة (25%)
  totalPaidFromPocket: number;        // مدفوعات دفعها من جيبه للمحل
  totalWithdrawals: number;           // مسحوبات الشريك
  lastLogin?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  partnerName: string;
  actionType:
    | 'شراء'
    | 'إنتاج توليفة'
    | 'بيع جملة'
    | 'بيع محل'
    | 'مزامنة كاشير'
    | 'مصروف'
    | 'تعديل وصفة/صنف'
    | 'مرتجع'
    | 'سداد/تحصيل'
    | 'دخول للنظام'
    | 'جرد مخزن'
    | 'شؤون عمال';
  description: string;
  amount?: number;
}

export interface StocktakingItemVariance {
  itemId: string;
  itemName: string;
  baseUnit: 'kg' | 'piece' | 'liter';
  systemStock: number;
  actualStock: number;
  difference: number;        // actualStock - systemStock
  unitCost: number;
  financialDifference: number; // difference * unitCost
}

export interface StocktakingAuditRecord {
  id: string;
  auditNumber: string;
  date: string;
  partnerName: string;
  notes?: string;
  totalShortageValue: number;
  totalSurplusValue: number;
  netVarianceValue: number;
  itemsAudited: StocktakingItemVariance[];
}

export interface Employee {
  id: string;
  name: string;
  role: 'باريستا' | 'كاشير' | 'مسؤول مطحنة وإنتاج' | 'عامل مخزن وفرع';
  phone: string;
  salaryType: 'شهري' | 'يومية';
  baseMonthlySalary: number;
  dailyRate: number;
  workedDaysThisMonth: number;
  totalAdvances: number;     // السلف المسحوبة خلال الشهر
  totalDeductions: number;   // الخصومات أو تحميل عجز الجرد
  totalBonuses: number;      // المكافآت والإضافي
  totalPaidOut: number;      // ما تم صرفه من الراتب
}

export interface EmployeeTransaction {
  id: string;
  date: string;
  employeeId: string;
  employeeName: string;
  type: 'سلفة' | 'حضور يومية' | 'خصم/عجز' | 'مكافأة' | 'صرف راتب';
  amount: number;
  notes: string;
  partnerName: string;
}

export interface AccountPaymentRecord {
  id: string;
  date: string;
  targetType: 'supplier' | 'customer';
  targetId: string;
  targetName: string;
  amount: number;
  partnerName: string;
  notes?: string;
}

export interface ShiftRecord {
  id: string;
  date: string;
  shiftName: 'الوردية الصباحية' | 'الوردية المسائية' | 'وردية اليوم الكامل';
  cashierName: string;
  supervisorPartner: string;
  openingCash: number;
  cashSales: number;
  expensesPaid: number;
  expectedCash: number;
  actualCash: number;
  difference: number;
  status: 'مفتوحة' | 'مغلقة ومطابقة' | 'بها عجز' | 'بها زيادة';
}
