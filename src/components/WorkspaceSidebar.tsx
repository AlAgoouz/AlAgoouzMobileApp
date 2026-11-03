import React from 'react';
import {Home,LayoutGrid,UserRound,ChevronLeft} from 'lucide-react';
import {sectionLinks} from './SectionsHub';
export function WorkspaceSidebar({screen,name,onNavigate}:{screen:string;name:string;onNavigate:(id:string)=>void}){
 const links=[{id:'home',title:'نظرة على المحل',icon:Home,group:'مساحة العمل'},{id:'sections',title:'الأقسام',icon:LayoutGrid,group:'مساحة العمل'},...sectionLinks,{id:'more',title:'حسابي',icon:UserRound,group:'حساب الدخول'}];
 return <aside className="workspace-sidebar" aria-label="قائمة العمل"><div className="sidebar-brand"><img loading="lazy" decoding="async" src="/logo.png" width="48" height="48" alt="بُن العجوز"/><div><b>بُن العجوز</b><span>أصل المزاج · إدارة المحل</span></div></div><nav aria-label="أقسام الكمبيوتر">{['مساحة العمل','التشغيل اليومي','المخزون والمشتريات','الحسابات والإدارة','حساب الدخول'].map(group=><section key={group}><h2>{group}</h2>{links.filter(l=>l.group===group).map(link=><button key={link.id} type="button" aria-current={screen===link.id?'page':undefined} onClick={()=>onNavigate(link.id)}><link.icon size={18}/><span>{link.title}</span>{screen===link.id&&<ChevronLeft size={15}/>}</button>)}</section>)}</nav><div className="sidebar-account"><span>{name.charAt(0)}</span><div><b>{name}</b><small>مساحة العمل الخاصة بك</small></div></div></aside>;
}
