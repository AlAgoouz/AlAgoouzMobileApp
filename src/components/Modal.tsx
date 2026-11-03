import React,{useEffect,useId,useRef} from 'react';
import {createPortal} from 'react-dom';
import {X,PanelTop} from 'lucide-react';

let scrollLocks=0;
let previousOverflow='';

/** Native top-layer dialogs isolate keyboard focus and escape page transforms. */
export function Modal({title,description,onClose,busy=false,dismissible=true,wide=false,footer,children}:{title:React.ReactNode;description?:React.ReactNode;onClose?:()=>void;busy?:boolean;dismissible?:boolean;wide?:boolean;footer?:React.ReactNode;children:React.ReactNode}){
 const ref=useRef<HTMLDialogElement>(null),headingId=useId(),descriptionId=useId();
 useEffect(()=>{
  const dialog=ref.current!;
  const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  if(scrollLocks++===0){previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}
  dialog.showModal();
  return()=>{
   dialog.close();
   if(--scrollLocks===0)document.body.style.overflow=previousOverflow;
   if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
  };
 },[]);
 return createPortal(<dialog ref={ref} dir="rtl" className={`agouz-modal${wide?' agouz-modal-wide':''}`} aria-labelledby={headingId} aria-describedby={description?descriptionId:undefined} aria-modal="true" aria-busy={busy||undefined} onCancel={e=>{e.preventDefault();if(dismissible&&!busy)onClose?.();}}>
  <header className="modal-heading"><span className="modal-symbol"><PanelTop size={21} aria-hidden="true"/></span><div><p className="modal-eyebrow">بُن العجوز</p><h2 id={headingId}>{title}</h2>{description&&<p id={descriptionId} className="modal-description">{description}</p>}</div>{dismissible&&onClose&&<button type="button" className="modal-close" aria-label="إغلاق النافذة" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true"/></button>}</header>
  <div className="modal-body">{children}</div>
  {footer&&<footer className="modal-footer">{footer}</footer>}
 </dialog>,document.body);
}
