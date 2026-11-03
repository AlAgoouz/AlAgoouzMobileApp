import React from 'react';
import {ChevronRight, type LucideIcon} from 'lucide-react';

export function OperationHeader({title,description,icon:Icon,onBack,busy=false}:{title:string;description:string;icon:LucideIcon;onBack:()=>void;busy?:boolean}){
  return <header className="operation-header">
    <button type="button" disabled={busy} onClick={onBack}><ChevronRight size={17} aria-hidden="true" />رجوع</button>
    <div className="operation-heading"><span className="operation-heading-icon"><Icon size={25} aria-hidden="true" /></span><h1>{title}</h1></div>
    <p>{description}</p>
  </header>;
}
