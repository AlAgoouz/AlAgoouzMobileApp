import React,{useEffect,useId,useRef} from 'react';
import {createPortal} from 'react-dom';
import {X,PanelTop} from 'lucide-react';

let scrollLocks=0;
let previousOverflow='';

/** Native top-layer dialogs isolate keyboard focus and escape page transforms. */
export function Modal({title,description,onClose,busy=false,dismissible=true,wide=false,layout,footer,children}:{title:React.ReactNode;description?:React.ReactNode;onClose?:()=>void;busy?:boolean;dismissible?:boolean;wide?:boolean;layout?:"side";footer?:React.ReactNode;children:React.ReactNode}){
 const ref=useRef<HTMLDialogElement>(null),headingId=useId(),descriptionId=useId();
 useEffect(()=>{
  const dialog=ref.current!;
  const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  if(scrollLocks++===0){previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}
  dialog.showModal();
  dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
  return()=>{
   dialog.close();
   if(--scrollLocks===0)document.body.style.overflow=previousOverflow;
   if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
  };
 },[]);
 const keepFocus=(event:React.KeyboardEvent<HTMLDialogElement>)=>{
  if(event.key!=='Tab')return;
  const dialog=ref.current!;
  const controls=Array.from(dialog.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]')).filter(element=>element.tabIndex>=0&&!element.matches(':disabled')&&element.getClientRects().length>0);
  const first=controls[0],last=controls[controls.length-1];
  if(!first){event.preventDefault();dialog.focus();return;}
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last!.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 };
 return createPortal(<dialog ref={ref} dir="rtl" className={`agouz-modal${wide?' agouz-modal-wide':''}`} data-layout={layout} aria-labelledby={headingId} aria-describedby={description?descriptionId:undefined} aria-modal="true" aria-busy={busy||undefined} onKeyDown={keepFocus} onCancel={e=>{e.preventDefault();if(dismissible&&!busy)onClose?.();}}>
  <header className="modal-heading"><span className="modal-symbol"><PanelTop size={21} aria-hidden="true"/></span><div><p className="modal-eyebrow">بُن العجوز</p><h2 id={headingId}>{title}</h2>{description&&<p id={descriptionId} className="modal-description">{description}</p>}</div>{dismissible&&onClose&&<button type="button" className="modal-close" aria-label="إغلاق النافذة" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true"/></button>}</header>
  <div className="modal-body">{children}</div>
  {footer&&<footer className="modal-footer">{footer}</footer>}
 </dialog>,document.body);
}
