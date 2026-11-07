import React, {useId} from 'react';
import {ArrowDownLeft, ArrowUp, Coffee, MapPin, MessageCircle, Phone} from 'lucide-react';
import type {MenuItem, ShopMenu} from '../lib/shopMenu';
import './shop-menu.css';

const egp = new Intl.NumberFormat('ar-EG', {style: 'currency', currency: 'EGP', maximumFractionDigits: 2, minimumFractionDigits: 0});
const number = new Intl.NumberFormat('ar-EG', {minimumIntegerDigits: 2});
export const menuLogo = '/menu-logo.webp';

export function ShopMenuView({menu, preview = false}: {menu: ShopMenu; preview?: boolean}) {
  const menuId = useId();
  const sections = new Map<string, MenuItem[]>();
  for (const item of menu.items) {
    if (!item.visible) continue;
    const section = item.section.trim() || 'أصناف';
    const group = sections.get(section);
    if (group) group.push(item);
    else sections.set(section, [item]);
  }
  const contacts = [
    {label: 'اتصل بنا', url: menu.phone && `tel:${menu.phone}`, icon: Phone},
    {label: 'واتساب', url: menu.whatsapp && `https://wa.me/${menu.whatsapp.replace(/^\+/, '')}`, icon: MessageCircle},
    {label: 'الموقع', url: menu.location, icon: MapPin},
  ].filter(contact => contact.url);
  const Heading = preview ? 'h2' : 'h1';
  const SectionHeading = preview ? 'h3' : 'h2';
  const categories = [...sections];
  const sectionId = (index: number) => `${menuId}-menu-${index}`;

  return <article id={menuId} className={`shop-menu shop-menu--${menu.template}`} dir="rtl">
    <header className="shop-menu-brand">
      <span className="shop-menu-brand-mark"><img src={menu.logo || menuLogo} width="96" height="96" alt="" /></span>
      <div className="shop-menu-brand-copy"><span className="shop-menu-kicker">قائمة المحل</span>
        <Heading>{menu.name || 'بُن العجوز'}</Heading>
        {menu.intro && <p>{menu.intro}</p>}
      </div>
    </header>
    {(categories.length > 1 || contacts.length > 0) && <nav className="shop-menu-index" aria-label="التنقل في المنيو">
      {categories.length > 1 && <>
        <span className="shop-menu-index-label">الأقسام</span>
        {categories.map(([name], index) => preview
          ? <button type="button" key={name} onClick={() => document.getElementById(sectionId(index))?.scrollIntoView({block: 'nearest'})}>{name}</button>
          : <a key={name} href={`#${sectionId(index)}`}>{name}<ArrowDownLeft size={14} aria-hidden="true" /></a>)}
      </>}
      {contacts.length > 0 && (preview
        ? <button type="button" onClick={() => document.getElementById(`${menuId}-contacts`)?.scrollIntoView({block: 'nearest'})}>التواصل</button>
        : <a href={`#${menuId}-contacts`}>التواصل<ArrowDownLeft size={14} aria-hidden="true" /></a>)}
    </nav>}
    {categories.map(([name, items], index) => <section key={name} id={sectionId(index)} className="shop-menu-section" aria-labelledby={`${sectionId(index)}-title`}>
      <div className="shop-menu-section-title">
        <span aria-hidden="true">{number.format(index + 1)}</span>
        <SectionHeading id={`${sectionId(index)}-title`}>{name}</SectionHeading>
      </div>
      <ul>{items.map(item => <li key={item.id} className={`shop-menu-product${item.photo && menu.template === 'photos' ? ' has-photo' : ''}`}>
        {menu.template === 'photos' && item.photo && <img className="shop-menu-product-photo" src={item.photo} loading="lazy" decoding="async" alt="" />}
        <div className="shop-menu-product-details">
          <div className="shop-menu-product-copy"><strong>{item.name || 'صنف جديد'}</strong>{item.description && <p>{item.description}</p>}</div>
          <dl className="shop-menu-prices">{item.prices.map((option, index) => <div key={index}>
            <dt className={option.label ? undefined : 'sr-only'}>{option.label || 'السعر'}</dt>
            <dd><bdi>{option.amount === null ? '—' : egp.format(option.amount)}</bdi></dd>
          </div>)}</dl>
        </div>
      </li>)}</ul>
    </section>)}
    {!sections.size && <div className="shop-menu-empty"><Coffee size={25} aria-hidden="true" /><p>مفيش أصناف ظاهرة في المنيو حاليًا.</p></div>}
    {(contacts.length > 0 || (!preview && categories.length > 1)) && <footer id={`${menuId}-contacts`} className="shop-menu-footer">
      {contacts.length > 0 && <nav className="shop-menu-contacts" aria-label="التواصل مع المحل">
        {contacts.map(({label, url, icon: Icon}) => preview
          ? <span key={label}><Icon size={17} aria-hidden="true" />{label}</span>
          : <a key={label} href={url} target={url.startsWith('https:') ? '_blank' : undefined} rel="noopener noreferrer"><Icon size={17} aria-hidden="true" />{label}</a>)}
      </nav>}
      {!preview && categories.length > 1 && <a className="shop-menu-top" href={`#${menuId}`}><ArrowUp size={16} aria-hidden="true" />أول المنيو</a>}
    </footer>}
  </article>;
}
