// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {UsersScreen} from '../src/components/UsersScreen';
import {FinancialPartnersScreen} from '../src/components/FinancialPartnersScreen';
import {INITIAL_PARTNERS} from '../src/data/initialData';
import type {UserAccess,ManagedUser} from '../src/lib/userAccess';
const api=vi.hoisted(()=>({list:vi.fn(),save:vi.fn()}));
vi.mock('../src/lib/userAccounts',()=>({listUserAccounts:api.list,saveUserAccount:api.save}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const owner:UserAccess={userId:'owner',partnerId:'p1',username:'owner',displayName:'Owner',role:'partner',isOwner:true,permissions:{view:true}};
const row:ManagedUser={...owner,email:'owner@example.test',disabled:false,deleted:false,createdAt:'2026-11-03'};
it('shows the master as protected and never offers deleting or disabling it',async()=>{
 api.list.mockResolvedValue([row]);render(<UsersScreen access={owner} partners={INITIAL_PARTNERS} onBack={()=>{}}/>);
 await screen.findByText('المالك الرئيسي — محمي');
 expect(screen.queryByRole('button',{name:'حذف المستخدم'})).toBeNull();expect(screen.queryByRole('button',{name:'تعطيل المستخدم'})).toBeNull();
});
it('creates a separate cashier account without changing financial partners',async()=>{
 api.list.mockResolvedValue([row]);api.save.mockResolvedValue(undefined);const partners=structuredClone(INITIAL_PARTNERS);
 render(<UsersScreen access={owner} partners={partners} onBack={()=>{}}/>);
 await screen.findByText('المالك الرئيسي — محمي');fireEvent.click(screen.getByRole('button',{name:'إضافة مستخدم',exact:true}));
 fireEvent.change(screen.getByLabelText('الاسم'),{target:{value:'Cashier'}});
 fireEvent.change(screen.getByLabelText('اسم المستخدم'),{target:{value:'cashier'}});
 fireEvent.change(screen.getByLabelText('البريد الإلكتروني'),{target:{value:'cashier@example.test'}});
 fireEvent.change(screen.getByLabelText('كلمة المرور'),{target:{value:'Local-Only-Test-123!'}});
 fireEvent.submit(screen.getByLabelText('كلمة المرور').closest('form')!);
 await waitFor(()=>expect(api.save).toHaveBeenCalledWith(expect.objectContaining({role:'cashier',partnerId:null,permissions:{}})));
 expect(partners).toEqual(INITIAL_PARTNERS);
});
it('keeps failed account creation editable instead of reporting success',async()=>{
 api.list.mockResolvedValue([row]);api.save.mockRejectedValue(new Error('رفض إنشاء المستخدم'));
 render(<UsersScreen access={owner} partners={[]} onBack={()=>{}}/>);await screen.findByText('المالك الرئيسي — محمي');
 fireEvent.click(screen.getByRole('button',{name:'إضافة مستخدم',exact:true}));
 fireEvent.submit(screen.getByLabelText('اسم المستخدم').closest('form')!);
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','رفض إنشاء المستخدم');
 expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.queryByText('تم إنشاء المستخدم دون إضافة شريك أو تغيير الحصص')).toBeNull();
});
it('never requests another user roster for a non-owner account',()=>{
 render(<UsersScreen access={{...owner,isOwner:false,partnerId:null}} partners={[]} onBack={()=>{}}/>);
 expect(api.list).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'إضافة مستخدم'})).toBeNull();
});
it('keeps financial partners free of login fields and saves percentages atomically',()=>{
 const save=vi.fn(()=>true);render(<FinancialPartnersScreen partners={INITIAL_PARTNERS} canEdit onSave={save} onBack={()=>{}} onReports={()=>{}}/>);
 expect(screen.queryByLabelText('اسم المستخدم')).toBeNull();expect(screen.queryByLabelText('كلمة المرور')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'إدارة الشركاء والنسب'}));
 const first=INITIAL_PARTNERS[0];fireEvent.change(screen.getByLabelText(`نسبة الشريك ${first.id}`),{target:{value:'99'}});
 fireEvent.click(screen.getByRole('button',{name:'حفظ الشركاء والحصص'}));expect(save).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('100%');
 fireEvent.change(screen.getByLabelText(`نسبة الشريك ${first.id}`),{target:{value:String(first.sharePercent)}});
 fireEvent.click(screen.getByRole('button',{name:'حفظ الشركاء والحصص'}));expect(save).toHaveBeenCalledExactlyOnceWith(INITIAL_PARTNERS);
});
