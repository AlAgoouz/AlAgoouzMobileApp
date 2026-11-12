import React, {useId, useState} from 'react';
import {ChevronDown, ChevronLeft, FolderSync, Receipt, Search} from 'lucide-react';
import {sectionLinks, workspaceGroups} from './workspaceSections';
import './workspace-directory.css';

const normalize = (value: string) => value.normalize('NFKC').replace(/[أإآ]/g, 'ا').replace(/[\u064B-\u065F\u0640]/g, '').trim().toLowerCase();

interface Props {
  onNavigate: (id: string) => void;
  counts: Record<string, number>;
  isOwner: boolean;
  canManageCashier: boolean;
  canCreateSale: boolean;
}

export function SectionsHub({onNavigate, counts, isOwner, canManageCashier, canCreateSale}: Props) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const search = normalize(query);
  const filtered = sectionLinks.filter(link => (!link.ownerOnly || isOwner) &&
    normalize(`${link.title} ${link.description} ${link.group}`).includes(search));

  return <section className="sections-hub" aria-labelledby="sections-title">
    <header className="directory-heading">
      <h1 id="sections-title">الأقسام</h1>
      {(canManageCashier || canCreateSale) && <div className="directory-quick-actions" aria-label="إجراءات سريعة">
        {canManageCashier && <button type="button" onClick={() => onNavigate('cashier_sync')}><FolderSync size={18} aria-hidden="true" />رفع تقارير الكاشير</button>}
        {canCreateSale && <button type="button" onClick={() => onNavigate('sales_pos')}><Receipt size={18} aria-hidden="true" />فاتورة جملة جديدة</button>}
      </div>}
    </header>
    <div className="sections-search">
      <Search size={20} aria-hidden="true" />
      <input aria-label="ابحث في الأقسام" placeholder="اسم القسم أو نوع العملية" type="search" value={query} onChange={event => setQuery(event.target.value)} />
      {query && <button type="button" onClick={() => setQuery('')}>مسح</button>}
    </div>
    {workspaceGroups.map((group, index) => {
      const visible = filtered.filter(link => link.group === group);
      if (!visible.length) return null;
      const open = !!search || !collapsed.includes(group);
      const panelId = `${id}-group-${index}`;
      return <section key={group} className="section-group" aria-label={group}>
        <h2>
          <button type="button" className="directory-group-toggle" aria-expanded={open} aria-controls={panelId} disabled={!!search} onClick={() => {
            setCollapsed(current => open ? [...current, group] : current.filter(value => value !== group));
          }}>
            {group}<ChevronDown size={17} aria-hidden="true" />
          </button>
        </h2>
        <div className="section-grid" id={panelId} hidden={!open}>{visible.map(link =>
          <button type="button" key={link.id} className="section-tile" onClick={() => onNavigate(link.id)}>
            <span className="section-icon"><link.icon size={20} aria-hidden="true" /></span>
            <span className="directory-link-copy">
              <span className="section-tile-title">{link.title}</span>
              <span className="section-tile-description">{link.description}</span>
            </span>
            {counts[link.id] > 0 && <span className={`section-count${link.id === 'shortages' ? ' has-shortage' : ''}`}>{counts[link.id].toLocaleString('ar-EG')}</span>}
            <ChevronLeft className="section-tile-arrow" size={16} aria-hidden="true" />
          </button>
        )}</div>
      </section>;
    })}
    {!filtered.length && <div className="section-empty" role="status">
      <Search size={28} aria-hidden="true" /><p>مفيش قسم بالاسم ده</p>
      <button type="button" onClick={() => setQuery('')}>عرض كل الأقسام</button>
    </div>}
  </section>;
}
