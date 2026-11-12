import React from 'react';
import {ChevronLeft, Home, LayoutGrid, UserRound} from 'lucide-react';
import {sectionLinks, workspaceGroups} from './workspaceSections';

export function WorkspaceSidebar({screen, name, onNavigate, isOwner = false}: {
  screen: string;
  name: string;
  onNavigate: (id: string) => void;
  isOwner?: boolean;
}) {
  const links = [
    {id: 'home', title: 'نظرة على المحل', icon: Home, group: 'مساحة العمل'},
    {id: 'sections', title: 'الأقسام', icon: LayoutGrid, group: 'مساحة العمل'},
    ...sectionLinks.filter(link => !link.ownerOnly || isOwner),
    {id: 'more', title: 'حسابي', icon: UserRound, group: 'مساحة العمل'},
  ];

  return <aside className="workspace-sidebar" aria-label="قائمة العمل">
    <div className="sidebar-brand">
      <img loading="lazy" decoding="async" src="/logo.png" width="48" height="48" alt="" />
      <b>بُن العجوز</b>
    </div>
    <nav aria-label="أقسام الكمبيوتر">{['مساحة العمل', ...workspaceGroups].map(group => {
      const groupLinks = links.filter(link => link.group === group);
      return groupLinks.length > 0 && <section key={group}>
        <h2>{group}</h2>
        {groupLinks.map(link => <button key={link.id} type="button" aria-current={screen === link.id ? 'page' : undefined} onClick={() => onNavigate(link.id)}>
          <link.icon size={18} aria-hidden="true" /><span>{link.title}</span>
          {screen === link.id && <ChevronLeft size={15} aria-hidden="true" />}
        </button>)}
      </section>;
    })}</nav>
    <div className="sidebar-account"><span aria-hidden="true">{name.charAt(0)}</span><b>{name}</b></div>
  </aside>;
}
