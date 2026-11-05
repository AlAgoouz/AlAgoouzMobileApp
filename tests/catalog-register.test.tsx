// @vitest-environment jsdom
import React from 'react';import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {CatalogNameDraftPanel} from '../src/components/CatalogNameDraftPanel';
import {ProductsCatalogScreen} from '../src/components/ManagementScreens';
import {browseCatalog} from '../src/lib/catalogBrowse';
import {INITIAL_ITEMS} from '../src/data/initialData';
afterEach(cleanup);
const draft={id:'draft',name:'بن برازيلى وسط',sourceRepository:'AlAgoouz/Erp-AlAgoouz',sourceCommit:'a'.repeat(40),sourcePath:'names.ts',importedAt:'2026-11-05T00:00:00.000Z'};
const props={onAddNewItem:vi.fn(),onUpdateItem:vi.fn(),onDeleteItem:vi.fn(),onNavigateToProduction:vi.fn(),onNavigateToInventory:vi.fn(),onNavigateToPurchase:vi.fn(),onBack:vi.fn()};
it('reduces a 28-page card dataset to seven bounded register pages and resets navigation on search',()=>{
 const rows=Array.from({length:336},(_,i)=>({...draft,id:'row'+i,name:'منتج '+String(i).padStart(3,'0')}));
 render(<CatalogNameDraftPanel drafts={rows} items={[]}/>);
 expect(screen.getAllByRole('listitem')).toHaveLength(50);
 const jump=screen.getByRole('combobox',{name:'انتقل إلى صفحة الأسماء المستوردة'}) as HTMLSelectElement;
 expect(jump.options).toHaveLength(7);fireEvent.change(jump,{target:{value:'6'}});expect(screen.getAllByRole('listitem')).toHaveLength(36);
 fireEvent.change(screen.getByRole('searchbox',{name:'بحث في الأسماء المستوردة'}),{target:{value:'منتج 000'}});
 expect(screen.getAllByRole('listitem')).toHaveLength(1);expect(screen.getByText('منتج 000')).toBeTruthy();expect(screen.queryByRole('combobox',{name:'انتقل إلى صفحة الأسماء المستوردة'})).toBeNull();
 fireEvent.change(screen.getByRole('searchbox',{name:'بحث في الأسماء المستوردة'}),{target:{value:''}});
 expect((screen.getByRole('combobox',{name:'انتقل إلى صفحة الأسماء المستوردة'}) as HTMLSelectElement).value).toBe('0');
 expect(screen.getByRole('heading',{name:'منتج 000'})).toBeTruthy();
});
it('changes page density without rendering the entire product dataset',()=>{
 const rows=Array.from({length:220},(_,i)=>({...draft,id:'row'+i,name:'Name '+i}));render(<CatalogNameDraftPanel drafts={rows} items={[]}/>);
 const size=screen.getByRole('combobox',{name:'عدد النتائج في الصفحة'});
 fireEvent.change(screen.getByRole('combobox',{name:'انتقل إلى صفحة الأسماء المستوردة'}),{target:{value:'3'}});
 fireEvent.change(size,{target:{value:'100'}});expect(screen.getAllByRole('listitem')).toHaveLength(100);
 fireEvent.change(size,{target:{value:'25'}});expect(screen.getAllByRole('listitem')).toHaveLength(25);
 fireEvent.change(size,{target:{value:'50'}});expect((screen.getByRole('combobox',{name:'انتقل إلى صفحة الأسماء المستوردة'}) as HTMLSelectElement).value).toBe('0');
});
it('matches Arabic spelling variants and code digits without mutating or merging product identities',()=>{
 const rows=[{id:'second',name:'بُن برازيلى وسط',code:'IT-12'},{id:'first',name:'بن برازيلي فاتح',code:'IT-2'}],before=structuredClone(rows);
 expect(browseCatalog(rows,'برازيلي وسط ١٢','name').map(r=>r.id)).toEqual(['second']);
 expect(browseCatalog(rows,'برازيلي','name')).toHaveLength(2);expect(rows).toEqual(before);
});
it('separates pending names from ready products while preserving explicit management actions',()=>{
 const item={...INITIAL_ITEMS[0],id:'ready',name:'Ready product'};
 render(<ProductsCatalogScreen {...props} items={[item]} nameDrafts={[draft]} onCompleteNameDraft={vi.fn()} onChangeNameDraft={vi.fn()}/>);
 expect(screen.getByRole('button',{name:'تحتاج استكمال (1)'}).getAttribute('aria-pressed')).toBe('true');
 expect(screen.getByRole('heading',{name:draft.name})).toBeTruthy();expect(screen.queryByRole('heading',{name:item.name})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'جاهزة للاستخدام (1)'}));expect(screen.getByRole('heading',{name:item.name})).toBeTruthy();
 expect(screen.getByRole('button',{name:'تعديل المنتج Ready product'})).toBeTruthy();expect(screen.getByRole('button',{name:'حذف المنتج Ready product'})).toBeTruthy();
 expect(screen.queryByText('آخر سعر شراء')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'تفاصيل'}));expect(screen.getByText('آخر سعر شراء')).toBeTruthy();
 expect(props.onUpdateItem).not.toHaveBeenCalled();expect(props.onDeleteItem).not.toHaveBeenCalled();
});
it('bounds ready products too and keeps type filtering across the complete catalog',()=>{
 const rows=Array.from({length:151},(_,i)=>({...INITIAL_ITEMS[0],id:'ready'+i,code:'R'+i,name:'Product '+i,category:i===150?'snack' as const:'raw_bean' as const}));
 render(<ProductsCatalogScreen {...props} items={rows}/>);expect(screen.getAllByRole('listitem')).toHaveLength(50);
 fireEvent.change(screen.getByRole('combobox',{name:'انتقل إلى صفحة المنتجات الجاهزة'}),{target:{value:'2'}});
 fireEvent.click(screen.getByRole('button',{name:'سناكس',exact:true}));expect(screen.getAllByRole('listitem')).toHaveLength(1);expect(screen.getByRole('heading',{name:'Product 150'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'كل المنتجات (151)',exact:true}));expect((screen.getByRole('combobox',{name:'انتقل إلى صفحة المنتجات الجاهزة'}) as HTMLSelectElement).value).toBe('0');
});
