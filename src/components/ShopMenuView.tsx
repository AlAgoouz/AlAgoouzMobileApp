import React from 'react';
import {Coffee, MapPin, MessageCircle, Phone} from 'lucide-react';
import type {MenuItem, ShopMenu} from '../lib/shopMenu';
import './shop-menu.css';

const egp = new Intl.NumberFormat('ar-EG', {style: 'currency', currency: 'EGP', maximumFractionDigits: 2, minimumFractionDigits: 0});

export function ShopMenuView({menu, preview = false}: {menu: ShopMenu; preview?: boolean}) {
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
  return <article className={`shop-menu shop-menu--${menu.template}`} dir="rtl">
    <header className="shop-menu-brand">
      <img src={menu.logo || '/logo.png'} width="80" height="80" alt="" />
      <div><span className="shop-menu-kicker">قائمة بُن العجوز</span>
        <Heading>{menu.name || 'بُن العجوز'}</Heading>
        {menu.intro && <p>{menu.intro}</p>}
      </div>
    </header>
    {contacts.length > 0 && <nav className="shop-menu-contacts" aria-label="التواصل مع المحل">
      {contacts.map(({label, url, icon: Icon}) => preview
        ? <span key={label}><Icon size={16} aria-hidden="true" />{label}</span>
        : <a key={label} href={url} target={url.startsWith('https:') ? '_blank' : undefined} rel="noopener noreferrer"><Icon size={16} aria-hidden="true" />{label}</a>)}
    </nav>}
    {[...sections].map(([name, items]) => <section key={name} className="shop-menu-section">
      {preview ? <h3>{name}</h3> : <h2>{name}</h2>}
      <ul>{items.map(item => <li key={item.id} className="shop-menu-product">
        {menu.template === 'photos' && (item.photo
          ? <img className="shop-menu-product-photo" src={item.photo} loading="lazy" decoding="async" alt="" />
          : <span className="shop-menu-product-photo shop-menu-photo-placeholder"><Coffee size={28} aria-hidden="true" /></span>)}
        <div className="shop-menu-product-details">
          <div><strong>{item.name || 'صنف جديد'}</strong>{item.description && <p>{item.description}</p>}</div>
          <div className="shop-menu-prices">{item.prices.map((option, index) => <span key={index}>
            {option.label && <small>{option.label}</small>}
            <bdi>{option.amount === null ? '—' : egp.format(option.amount)}</bdi>
          </span>)}</div>
        </div>
      </li>)}</ul>
    </section>)}
    {!sections.size && <p className="shop-menu-empty">مفيش أصناف ظاهرة في المنيو حاليًا.</p>}
  </article>;
}
