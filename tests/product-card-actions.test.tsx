// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {ProductsCatalogScreen} from '../src/components/ManagementScreens';
import {INITIAL_ITEMS} from '../src/data/initialData';
afterEach(cleanup);
const item={...INITIAL_ITEMS[0],id:'active',name:'Test product'};
const props={items:[item],onAddNewItem:vi.fn(),onUpdateItem:vi.fn(),onDeleteItem:vi.fn(),onNavigateToProduction:vi.fn(),onNavigateToInventory:vi.fn(),onNavigateToPurchase:vi.fn(),onBack:vi.fn()};
it('keeps management actions hidden for a readonly catalog',()=>{
 render(<ProductsCatalogScreen {...props} canManage={false}/>);
 expect(screen.queryByRole('button',{name:'تعديل المنتج Test product'})).toBeNull();expect(screen.queryByRole('button',{name:'حذف المنتج Test product'})).toBeNull();
});
it('offers visible edit and delete actions with product-specific accessible names',()=>{
 render(<ProductsCatalogScreen {...props}/>);
 expect(screen.getByRole('button',{name:'تعديل المنتج Test product'}).textContent).toBe('تعديل');
 expect(screen.getByRole('button',{name:'حذف المنتج Test product'}).textContent).toContain('حذف');
 fireEvent.click(screen.getByRole('button',{name:'تعديل المنتج Test product'}));expect(screen.getByRole('dialog').textContent).toContain('تعديل بيانات وتسعير المنتج');
});
it('edits a ready product cashier code without replacing its prices, quantity or identity',()=>{
 const update=vi.fn(()=>true);render(<ProductsCatalogScreen {...props} onUpdateItem={update}/>);
 fireEvent.click(screen.getByRole('button',{name:'تعديل المنتج Test product'}));
 fireEvent.change(screen.getByLabelText('كود الكاشير / كود المنتج'),{target:{value:'00100010'}});
 fireEvent.click(screen.getByRole('button',{name:'حفظ التعديلات'}));expect(update).toHaveBeenCalledWith(item.id,{code:'00100010'});
});
it('rejects an empty or already-used cashier code before applying an edit',()=>{
 const update=vi.fn();render(<ProductsCatalogScreen {...props} items={[item,{...item,id:'second',code:'100010',name:'Second product'}]} onUpdateItem={update}/>);
 fireEvent.click(screen.getByRole('button',{name:'تعديل المنتج Test product'}));
 const input=screen.getByLabelText('كود الكاشير / كود المنتج');fireEvent.change(input,{target:{value:'100010'}});fireEvent.click(screen.getByRole('button',{name:'حفظ التعديلات'}));expect(screen.getByText('كود المنتج مستخدم لصنف آخر')).toBeTruthy();
 fireEvent.change(input,{target:{value:' '}});fireEvent.click(screen.getByRole('button',{name:'حفظ التعديلات'}));expect(screen.getByText('كود المنتج مطلوب')).toBeTruthy();expect(update).not.toHaveBeenCalled();
});
it('keeps a linked product rejection visible and does not delete on cancel',async()=>{
 const remove=vi.fn().mockRejectedValue(Error('المنتج مرتبط بفاتورة'));render(<ProductsCatalogScreen {...props} onDeleteItem={remove}/>);
 fireEvent.click(screen.getByRole('button',{name:'حذف المنتج Test product'}));expect(remove).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'إلغاء'}));expect(remove).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'حذف المنتج Test product'}));fireEvent.click(screen.getByRole('button',{name:'تأكيد حذف المنتج'}));
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toBe('المنتج مرتبط بفاتورة'));expect(screen.getByRole('dialog')).toBeTruthy();
});
