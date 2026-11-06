import React, { useState } from 'react';
import { AlertTriangle, BarChart3, BookOpen, Calculator, ChevronLeft, FileText, Flame, FolderSync, Package, RotateCcw, Scale, Search, ShoppingBag, Tag, Truck, UserCheck, Users, Wallet } from 'lucide-react';

interface SectionLink { id: string; title: string; description: string; icon: typeof Package; group: string; tone: string; }
export const sectionLinks: SectionLink[] = [
  {id:'products',title:'المنتجات والتسعير',description:'الأصناف والوصفات وأسعار البيع',icon:Tag,group:'التشغيل اليومي',tone:'gold'},
  {id:'sales_pos',title:'فواتير الجملة',description:'فاتورة جديدة لعميلك بسعر متفق عليه',icon:Calculator,group:'التشغيل اليومي',tone:'green'},
  {id:'cashier_sync',title:'تقارير يوم الكاشير',description:'التقرير المالي والأصناف المباعة',icon:FolderSync,group:'التشغيل اليومي',tone:'blue'},
  {id:'recipes',title:'الوصفات',description:'مقادير وتكلفة المشروبات والتحويجات والتوليفات',icon:BookOpen,group:'التشغيل اليومي',tone:'gold'},
  {id:'production',title:'إنتاج التوليفات',description:'أوامر إنتاج التوليفات وسجل تشغيلاتها فقط',icon:Flame,group:'التشغيل اليومي',tone:'rose'},
  {id:'inventory',title:'مخزن البن',description:'رصيد وقيمة كل صنف في المخزون',icon:Package,group:'المخزون والمشتريات',tone:'gold'},
  {id:'purchase',title:'المشتريات',description:'شراء الخامات وسجل الفواتير',icon:ShoppingBag,group:'المخزون والمشتريات',tone:'green'},
  {id:'stocktaking',title:'جرد الميزان',description:'مطابقة الكميات الفعلية مع الرصيد',icon:Scale,group:'المخزون والمشتريات',tone:'blue'},
  {id:'shortages',title:'النواقص',description:'العجز والأصناف التي تحتاج توريدًا',icon:AlertTriangle,group:'المخزون والمشتريات',tone:'rose'},
  {id:'customers',title:'عملاء الجملة',description:'بيانات العملاء والمديونيات والتحصيل',icon:Users,group:'الحسابات والإدارة',tone:'blue'},
  {id:'suppliers',title:'الموردين',description:'المشتريات ومقارنة أسعار الموردين',icon:Truck,group:'الحسابات والإدارة',tone:'green'},
  {id:'staff_payroll',title:'العمال والرواتب',description:'المستحقات والسلف وحركات العاملين',icon:UserCheck,group:'الحسابات والإدارة',tone:'gold'},
  {id:'users',title:'المستخدمين',description:'حساب المالك وحسابات الدخول والصلاحيات',icon:UserCheck,group:'الحسابات والإدارة',tone:'blue'},
  {id:'partners',title:'الشركاء والحصص',description:'نسب الملكية والمساهمات والمسحوبات',icon:Users,group:'الحسابات والإدارة',tone:'gold'},
  {id:'sales_invoices',title:'فواتير البيع',description:'سجل الجملة وأيام الكاشير',icon:FileText,group:'الحسابات والإدارة',tone:'blue'},
  {id:'expenses',title:'المصاريف',description:'المصروفات اليومية والشهرية الثابتة',icon:Wallet,group:'الحسابات والإدارة',tone:'rose'},
  {id:'reports',title:'التقارير والأرباح',description:'النتائج المالية ونصيب الشركاء',icon:BarChart3,group:'الحسابات والإدارة',tone:'green'},
  {id:'data_control',title:'إدارة البيانات',description:'النسخ الاحتياطي والاسترجاع',icon:RotateCcw,group:'الحسابات والإدارة',tone:'gold'},
];
const groups = ['التشغيل اليومي', 'المخزون والمشتريات', 'الحسابات والإدارة'];
const normalize = (value: string) => value.normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/[\u064B-\u065F\u0640]/g,'').trim().toLowerCase();
export function SectionsHub({onNavigate, counts}: {onNavigate:(id:string)=>void; counts:Record<string,number>}) {
  const [query, setQuery] = useState('');
  const filtered = sectionLinks.filter(link => normalize(`${link.title} ${link.description} ${link.group}`).includes(normalize(query)));
  return <section className="sections-hub" aria-labelledby="sections-title">
    <header className="sections-hero">
      <div className="sections-hero-mark" aria-hidden="true"><img src="/logo.png" alt="" width="88" height="88" /></div>
      <p className="sections-eyebrow">مساحة العمل</p><h1 id="sections-title">كل شغلك، بخطوة واحدة</h1>
      <p>من أول حبة بن، لآخر حساب في اليوم.</p>
    </header>
    <div className="sections-search"><Search size={20} aria-hidden="true" /><input aria-label="ابحث في الأقسام" placeholder="عايز تروح فين؟ ابحث عن قسم…" value={query} onChange={e => setQuery(e.target.value)} />{query && <button type="button" onClick={() => setQuery('')}>مسح</button>}</div>
    {groups.map(group => {
      const visible = filtered.filter(link => link.group === group);
      if (!visible.length) return null;
      return <section key={group} className="section-group" aria-label={group}>
        <h2><span />{group}<small>{visible.length} أقسام</small></h2>
        <div className="section-grid">{visible.map((link, index) => <button type="button" key={link.id} className={`section-tile tone-${link.tone}`} style={{animationDelay:`${Math.min(index,5)*35}ms`}} onClick={() => onNavigate(link.id)}>
          <span className="section-tile-top"><span className="section-icon"><link.icon size={23} aria-hidden="true" /></span>{counts[link.id] !== undefined && <span className={`section-count ${link.id === 'shortages' && counts[link.id] > 0 ? 'has-shortage' : ''}`} aria-label={`العدد: ${counts[link.id]}`}>{counts[link.id].toLocaleString('ar-EG')}</span>}</span>
          <span className="section-tile-title">{link.title}</span><span className="section-tile-description">{link.description}</span>
          <ChevronLeft className="section-tile-arrow" size={16} aria-hidden="true" />
        </button>)}</div>
      </section>;
    })}
    {!filtered.length && <div className="section-empty" role="status"><Search size={28} aria-hidden="true" /><p>مفيش قسم بالاسم ده</p><button type="button" onClick={() => setQuery('')}>عرض كل الأقسام</button></div>}
  </section>;
}
