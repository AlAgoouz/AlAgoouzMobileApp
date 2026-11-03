// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {ItemDefinitionModal} from '../src/components/ItemDefinitionModal';
import {WholesaleInvoiceScreen} from '../src/components/WholesaleInvoiceScreen';
import {CashierDayScreen} from '../src/components/CashierDayScreen';
import {PurchaseScreen} from '../src/components/PurchaseScreen';
import {INITIAL_ITEMS,INITIAL_CUSTOMERS,INITIAL_SUPPLIERS} from '../src/data/initialData';
import {approveCashierDay,attachCashierReport} from '../src/lib/cashierDays';
import {emptyStore} from '../src/lib/storeState';
afterEach(cleanup);
const raw={...INITIAL_ITEMS.find(i=>i.category==='raw_bean')!,id:'raw',code:'R1',name:'Raw bean',stock:10,costPrice:100,lastPurchasePrice:100};
const blend={...raw,id:'blend',code:'BL1',name:'Blend',category:'manufactured_blend' as const,hasRecipe:true,recipe:[{ingredientId:raw.id,ingredientName:raw.name,quantity:1000,unit:'gram' as const}]};
const customer={...INITIAL_CUSTOMERS[0],id:'customer',name:'Customer',phone:'01012345678',area:'Cairo'};
it('shows exactly seven categories and saves the recipe with the new blend',()=>{
 const save=vi.fn(()=>true);render(<ItemDefinitionModal items={[raw]} onSave={save} onClose={()=>{}}/>);
 expect((screen.getByLabelText('نوع الصنف') as HTMLSelectElement).options).toHaveLength(7);
 fireEvent.change(screen.getByLabelText('نوع الصنف'),{target:{value:'manufactured_blend'}});
 fireEvent.change(screen.getByLabelText('اسم الصنف'),{target:{value:'New blend'}});
 fireEvent.click(screen.getByRole('button',{name:'حفظ الصنف والوصفة'}));expect(save).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('المكون'),{target:{value:raw.id}});
 fireEvent.change(screen.getByLabelText('كمية المكون'),{target:{value:'1000'}});
 fireEvent.click(screen.getByRole('button',{name:'إضافة المكون'}));fireEvent.click(screen.getByRole('button',{name:'حفظ الصنف والوصفة'}));
 expect(save).toHaveBeenCalledWith(expect.objectContaining({category:'manufactured_blend',costingVersion:2,hasRecipe:true,recipe:[expect.objectContaining({ingredientId:raw.id,quantity:1000})]}));
});
it('requires a customer and offers only blends with a manual invoice selling price',async()=>{
 const save=vi.fn(async()=>true);render(<WholesaleInvoiceScreen items={[raw,blend]} customers={[customer]} currentPartnerName="Owner" onSaveSale={save} onBack={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'اعتماد الفاتورة وخصم المخزون'}));expect(save).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('عميل');
 fireEvent.change(screen.getByLabelText('العميل'),{target:{value:customer.id}});fireEvent.click(screen.getByRole('button',{name:'إضافة توليفة'}));
 expect((screen.getByLabelText('التوليفة') as HTMLSelectElement).options).toHaveLength(2);
 fireEvent.change(screen.getByLabelText('التوليفة'),{target:{value:blend.id}});fireEvent.change(screen.getByLabelText('الكمية بالكيلو'),{target:{value:'2'}});fireEvent.change(screen.getByLabelText('سعر الكيلو المتفق عليه'),{target:{value:'333'}});
 fireEvent.click(screen.getByRole('button',{name:'اعتماد الفاتورة وخصم المخزون'}));await waitFor(()=>expect(save).toHaveBeenCalledOnce());
 expect(save).toHaveBeenCalledWith(expect.objectContaining({customerId:customer.id,saleType:'wholesale',totalAmount:666,paidAmount:666,items:[expect.objectContaining({unitPrice:333})]}));
});
it('shows a missing day report and blocks approval until the pair is complete',()=>{
 const state=attachCashierReport({...emptyStore,items:[raw]},'2026-11-03',{type:'financial',file:{fileName:'financial.xlsx',sha256:'a'.repeat(64),uploadedAt:'2026-11-03'},totalRevenue:100});
 render(<CashierDayScreen items={[raw]} days={state.cashierDays} onAttach={async()=>{}} onApprove={async()=>{}} onBack={()=>{}}/>);
 expect((screen.getByRole('button',{name:'اعتماد اليوم وخصم الأصناف'}) as HTMLButtonElement).disabled).toBe(true);
 expect(screen.getByText(/تُحدد عند الاعتماد/)).toBeTruthy();
});
it('creates a fully paid taxed purchase and exposes no new credit option',()=>{
 const save=vi.fn(()=>true);render(<PurchaseScreen items={[raw]} suppliers={[INITIAL_SUPPLIERS[0]]} purchaseInvoices={[]} currentPartnerName="Owner" onSavePurchase={save} onBack={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'فاتورة جديدة'}));
 expect(screen.queryByRole('button',{name:'آجل (على الحساب)'})).toBeNull();
 fireEvent.change(screen.getByLabelText('ضريبة فاتورة الشراء'),{target:{value:'14'}});
 expect(screen.getByText(/مدفوعة بالكامل/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:/Raw bean/}));
  fireEvent.click(screen.getByRole('button',{name:/حفظ واعتماد الفاتورة/}));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({accountingVersion:2,netAmount:100,taxAmount:14,totalAmount:114,paidAmount:114,remainingAmount:0,paymentMethod:'نقدي'}));
});
