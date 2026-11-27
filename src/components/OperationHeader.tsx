import React, {createContext, useContext} from 'react';
import {ChevronRight, type LucideIcon} from 'lucide-react';

export const OperationToolbarAction = createContext<React.ReactNode>(null);

export function OperationHeader({title,description,icon:Icon,onBack,busy=false,backLabel='رجوع',children}:{title:React.ReactNode;description:React.ReactNode;icon:LucideIcon;onBack:()=>void;busy?:boolean;backLabel?:string;children?:React.ReactNode}){
  const toolbarAction=useContext(OperationToolbarAction);
  return <header className="operation-header">
    <div className="operation-toolbar"><button className="operation-back" type="button" disabled={busy} onClick={onBack}><ChevronRight size={17} aria-hidden="true" />{backLabel}</button>{toolbarAction}</div>
    <div className="operation-header-main"><div className="operation-heading"><span className="operation-heading-icon"><Icon size={24} aria-hidden="true" /></span><div><h1>{title}</h1><p>{description}</p></div></div>
    {children&&<div className="operation-actions">{children}</div>}</div>
  </header>;
}
