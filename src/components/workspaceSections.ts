import {AlertTriangle, BarChart3, BookOpen, Calculator, FileText, Flame, FolderSync, Package, RotateCcw, Scale, ShoppingBag, Tag, Truck, UserCheck, Users, UtensilsCrossed, Wallet, type LucideIcon} from 'lucide-react';

export const workspaceGroups = [
  'المبيعات والعملاء',
  'المنتجات والمخزون',
  'المشتريات والموردين',
  'الحسابات والإدارة',
  'أدوات المالك',
] as const;

interface SectionLink {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  group: typeof workspaceGroups[number];
  ownerOnly?: boolean;
}

export const sectionLinks: SectionLink[] = [
  {id: 'cashier_sync', title: 'تقارير يوم الكاشير', description: 'التقرير المالي والأصناف المباعة', icon: FolderSync, group: 'المبيعات والعملاء'},
  {id: 'sales_pos', title: 'فواتير الجملة', description: 'العميل والتوليفات والسعر المتفق عليه', icon: Calculator, group: 'المبيعات والعملاء'},
  {id: 'sales_invoices', title: 'سجل البيع', description: 'فواتير الجملة وأيام الكاشير', icon: FileText, group: 'المبيعات والعملاء'},
  {id: 'customers', title: 'عملاء الجملة', description: 'بيانات العملاء والمديونيات والتحصيل', icon: Users, group: 'المبيعات والعملاء'},
  {id: 'products', title: 'المنتجات والتسعير', description: 'الأكواد والوحدات وأسعار البيع', icon: Tag, group: 'المنتجات والمخزون'},
  {id: 'recipes', title: 'الوصفات', description: 'المقادير وتكلفة الوصفة', icon: BookOpen, group: 'المنتجات والمخزون'},
  {id: 'production', title: 'إنتاج التوليفات', description: 'أوامر الإنتاج والتشغيلات', icon: Flame, group: 'المنتجات والمخزون'},
  {id: 'inventory', title: 'مخزن البن', description: 'الكميات المتاحة وقيمة المخزون', icon: Package, group: 'المنتجات والمخزون'},
  {id: 'stocktaking', title: 'جرد الميزان', description: 'الكمية الفعلية والفروق', icon: Scale, group: 'المنتجات والمخزون'},
  {id: 'shortages', title: 'النواقص', description: 'العجز والأصناف عند حد الطلب', icon: AlertTriangle, group: 'المنتجات والمخزون'},
  {id: 'purchase', title: 'المشتريات', description: 'فواتير شراء الخامات', icon: ShoppingBag, group: 'المشتريات والموردين'},
  {id: 'suppliers', title: 'الموردين', description: 'بيانات المورد وسجل الأسعار', icon: Truck, group: 'المشتريات والموردين'},
  {id: 'expenses', title: 'المصاريف', description: 'المصروفات اليومية والشهرية الثابتة', icon: Wallet, group: 'الحسابات والإدارة'},
  {id: 'staff_payroll', title: 'العمال والرواتب', description: 'المستحقات والسلف وحركات العاملين', icon: UserCheck, group: 'الحسابات والإدارة'},
  {id: 'reports', title: 'التقارير والأرباح', description: 'الخزنة والنتائج المالية وحصص الأرباح', icon: BarChart3, group: 'الحسابات والإدارة'},
  {id: 'partners', title: 'الشركاء والحصص', description: 'النسب والمساهمات والمسحوبات', icon: Users, group: 'الحسابات والإدارة'},
  {id: 'users', title: 'المستخدمين والصلاحيات', description: 'حسابات الدخول وصلاحياتها', icon: UserCheck, group: 'أدوات المالك', ownerOnly: true},
  {id: 'shop_menu', title: 'صورة المنيو', description: 'نشر صورة المنيو ومشاركتها بكود QR', icon: UtensilsCrossed, group: 'أدوات المالك', ownerOnly: true},
  {id: 'data_control', title: 'إدارة البيانات', description: 'حالة النسخ الاحتياطي والاسترجاع', icon: RotateCcw, group: 'أدوات المالك', ownerOnly: true},
];
