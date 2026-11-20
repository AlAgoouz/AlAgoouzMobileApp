import React from 'react';
import { ChevronLeft, Home, LayoutGrid, Moon, Sun, UserRound } from 'lucide-react';
import { sectionLinks, workspaceGroups } from './workspaceSections';
import { useThemePreference } from '../lib/theme';

export function WorkspaceSidebar({
  screen,
  name,
  onNavigate,
  isOwner = false,
  canCreateSale = true,
  counts = {},
}: {
  screen: string;
  name: string;
  onNavigate: (id: string) => void;
  isOwner?: boolean;
  canCreateSale?: boolean;
  counts?: Record<string, number>;
}) {
  const { effective, toggleComfortScheme } = useThemePreference();
  const links = [
    { id: 'home', title: 'نظرة على المحل', icon: Home, group: 'مساحة العمل' },
    { id: 'sections', title: 'الأقسام', icon: LayoutGrid, group: 'مساحة العمل' },
    ...sectionLinks.filter((link) => (!link.ownerOnly || isOwner) && (link.id !== 'sales_pos' || canCreateSale)),
    { id: 'more', title: 'حسابي', icon: UserRound, group: 'مساحة العمل' },
  ];

  return (
    <aside className="workspace-sidebar" aria-label="قائمة العمل">
      <div className="sidebar-brand">
        <img loading="lazy" decoding="async" src="/logo.png" width="44" height="44" alt="" />
        <b>بُن العجوز</b>
      </div>
      <nav aria-label="أقسام الكمبيوتر">
        {['مساحة العمل', ...workspaceGroups].map((group) => {
          const groupLinks = links.filter((link) => link.group === group);
          return (
            groupLinks.length > 0 && (
              <section key={group}>
                <h2>{group}</h2>
                {groupLinks.map((link) => (
                  <button
                    key={link.id}
                    type="button"
                    aria-current={screen === link.id ? 'page' : undefined}
                    onClick={() => onNavigate(link.id)}
                  >
                    <link.icon size={18} aria-hidden="true" />
                    <span>{link.title}</span>
                    {counts[link.id] > 0 && (
                      <small className={`sidebar-count${link.id === 'shortages' ? ' has-shortage' : ''}`}>
                        {counts[link.id].toLocaleString('ar-EG')}
                      </small>
                    )}
                    {screen === link.id && <ChevronLeft size={15} aria-hidden="true" />}
                  </button>
                ))}
              </section>
            )
          );
        })}
      </nav>
      <div className="sidebar-account">
        <span aria-hidden="true">{name.charAt(0)}</span>
        <b>{name}</b>
        <button
          type="button"
          className="sidebar-theme-btn"
          onClick={toggleComfortScheme}
          aria-label={effective === 'dark' ? 'التبديل إلى وضع النهار' : 'التبديل إلى وضع المناوبة الليلية'}
          title={effective === 'dark' ? 'وضع النهار' : 'المناوبة الليلية'}
        >
          {effective === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
      </div>
    </aside>
  );
}
