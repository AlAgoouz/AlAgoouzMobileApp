// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {Modal} from '../src/components/Modal';
afterEach(cleanup);
it('keeps a busy dialog open on Escape and exposes its saving state',()=>{
 const close=vi.fn();const {rerender}=render(<Modal title="تعديل" onClose={close} busy><input aria-label="الاسم"/></Modal>);
 expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('true');
 expect((screen.getByRole('button',{name:'إغلاق النافذة'}) as HTMLButtonElement).disabled).toBe(true);
 const event=new Event('cancel',{cancelable:true});fireEvent(screen.getByRole('dialog'),event);
 expect(event.defaultPrevented).toBe(true);expect(close).not.toHaveBeenCalled();
 rerender(<Modal title="تعديل" onClose={close}><input aria-label="الاسم"/></Modal>);
 fireEvent(screen.getByRole('dialog'),new Event('cancel',{cancelable:true}));expect(close).toHaveBeenCalledOnce();
});
it('locks scrolling until the final dialog closes and restores the opening control focus',()=>{
 const opener=document.createElement('button');document.body.append(opener);opener.focus();document.body.style.overflow='auto';
 const first=render(<Modal title="الأولى" onClose={()=>{}}><input/></Modal>);
 screen.getByRole('button',{name:'إغلاق النافذة'}).focus();
 const second=render(<Modal title="الثانية" onClose={()=>{}}><input/></Modal>);
 expect(document.body.style.overflow).toBe('hidden');second.unmount();expect(document.body.style.overflow).toBe('hidden');
 first.unmount();expect(document.body.style.overflow).toBe('auto');expect(document.activeElement).toBe(opener);opener.remove();document.body.style.overflow='';
});
it('does not offer closing a blocking system notice',()=>{
 const close=vi.fn();render(<Modal title="تعذر الحفظ" onClose={close} dismissible={false}><p role="alert">أعد المحاولة</p></Modal>);
 expect(screen.queryByRole('button',{name:'إغلاق النافذة'})).toBeNull();
 fireEvent(screen.getByRole('dialog'),new Event('cancel',{cancelable:true}));expect(close).not.toHaveBeenCalled();
});
