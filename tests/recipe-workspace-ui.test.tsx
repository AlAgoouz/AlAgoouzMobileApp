// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {RecipesScreen} from '../src/components/RecipesScreen';
import {ItemDefinitionModal} from '../src/components/ItemDefinitionModal';
import {ProductsCatalogScreen} from '../src/components/ManagementScreens';
import {emptyStore} from '../src/lib/storeState';
import {recordRecipeDefinition} from '../src/lib/recipeCatalog';
import {money} from '../src/lib/reporting';
import type {InventoryItem,RecipeProductDefinition} from '../src/types/erp';
afterEach(cleanup);
const raw:InventoryItem={id:'coffee',code:'C',name:'Coffee',category:'raw_bean',baseUnit:'kg',stock:10,minStock:0,costPrice:400,lastPurchasePrice:400,retailPrice:600,wholesalePrice:0,canSellDirectly:true,hasRecipe:false,supplierPrices:[]};
const milk:InventoryItem={...raw,id:'milk',code:'M',name:'Milk',category:'direct_product',baseUnit:'liter',costPrice:30};
const cup:InventoryItem={...raw,id:'cup',code:'U',name:'Cup',category:'direct_product',baseUnit:'count',costPrice:1.5};
const definition:RecipeProductDefinition={code:'D1',category:'drink_recipe',baseUnit:'piece',retailPrice:50,openingStock:0,minStock:0};
const pending=()=>recordRecipeDefinition({...emptyStore,items:[raw,milk,cup]},'draft','Latte',definition,{name:'Owner'});
const pickIngredient=(id:string)=>{
 const item=[raw,milk,cup].find(row=>row.id===id)!;
 fireEvent.click(screen.getByRole('button',{name:'المكون',exact:true}));
 fireEvent.change(screen.getByRole('searchbox',{name:'ابحث باسم المكون أو الكود'}),{target:{value:item.name}});
 fireEvent.click(screen.getByRole('button',{name:new RegExp(item.name)}));
};
const add=(id:string,quantity:string)=>{pickIngredient(id);fireEvent.change(screen.getByLabelText('كمية المكون'),{target:{value:quantity}});fireEvent.click(screen.getByRole('button',{name:'إضافة المكون'}));};
const common={canManage:true,onDefine:vi.fn().mockResolvedValue(undefined),onBack:()=>{}};
it('saves drink metadata for the recipe section without asking for ingredients or a manual cost',async()=>{
 const save=vi.fn(),define=vi.fn().mockResolvedValue(undefined);render(<ItemDefinitionModal items={[raw]} requireDetails initialName="Latte" onSave={save} onSaveRecipeDefinition={define} onClose={()=>{}}/>);
 fireEvent.change(screen.getByLabelText('نوع الصنف'),{target:{value:'drink_recipe'}});fireEvent.change(screen.getByLabelText('كود الصنف (اختياري)'),{target:{value:'D1'}});fireEvent.change(screen.getByLabelText('سعر البيع المباشر'),{target:{value:'50'}});
 expect(screen.queryByLabelText('المكون')).toBeNull();expect(screen.queryByLabelText('تكلفة الوحدة قبل الضريبة')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'حفظ والانتقال إلى الوصفات'}));await waitFor(()=>expect(define).toHaveBeenCalledWith(expect.any(String),'Latte',definition));expect(save).not.toHaveBeenCalled();
});
it('allows retry of its own reserved code after a lost definition acknowledgement',async()=>{
 const define=vi.fn().mockRejectedValueOnce(Error('network')).mockResolvedValue(undefined),props={items:[raw],initialName:'Latte',allowedCategories:['drink_recipe'] as const,onSave:()=>false,onSaveRecipeDefinition:define,onClose:()=>{}};
 const view=render(<ItemDefinitionModal {...props} allowedCategories={['drink_recipe']}/>);
 fireEvent.change(screen.getByLabelText('كود الصنف (اختياري)'),{target:{value:'D1'}});
 fireEvent.click(screen.getByRole('button',{name:'حفظ والانتقال إلى الوصفات'}));await screen.findByText('network');
 view.rerender(<ItemDefinitionModal {...props} allowedCategories={['drink_recipe']} reservedCodes={['D1']}/>);
 fireEvent.click(screen.getByRole('button',{name:'حفظ والانتقال إلى الوصفات'}));await waitFor(()=>expect(define).toHaveBeenCalledTimes(2));expect(define.mock.calls[0][0]).toBe(define.mock.calls[1][0]);
});
it('computes cup cost from Arabic gram, ml and count quantities and refreshes when raw prices change',()=>{
 const s=pending(),props={...common,items:s.items,drafts:s.catalogNameDrafts,onSave:vi.fn().mockResolvedValue(undefined)};
 const view=render(<RecipesScreen {...props}/>);expect(screen.getByLabelText('إجمالي تكلفة الوصفة').textContent).toBe('غير محددة');
 add(raw.id,'١٨');add(milk.id,'٢٠٠');add(cup.id,'١');expect(screen.getByLabelText('إجمالي تكلفة الوصفة').textContent).toBe(money(14.7)+' ج.م');
 expect(screen.getByText(/لا تدخل أوامر الإنتاج/)).toBeTruthy();
 view.rerender(<RecipesScreen {...props} items={[raw,{...milk,costPrice:40},cup]}/>);expect(screen.getByLabelText('إجمالي تكلفة الوصفة').textContent).toBe(money(16.7)+' ج.م');
});
it('blocks uncommitted or invalid quantities instead of saving their previous values',async()=>{
 const s=pending(),save=vi.fn().mockResolvedValue(undefined);render(<RecipesScreen {...common} items={s.items} drafts={s.catalogNameDrafts} onSave={save}/>);
 add(raw.id,'18');const button=screen.getByRole('button',{name:'اعتماد الوصفة وتجهيز المنتج'}) as HTMLButtonElement;
 fireEvent.change(screen.getByLabelText('كمية Coffee'),{target:{value:''}});expect(button.disabled).toBe(true);fireEvent.click(button);expect(save).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('كمية Coffee'),{target:{value:'٢٥'}});expect(button.disabled).toBe(false);expect(screen.getByLabelText('إجمالي تكلفة الوصفة').textContent).toBe(money(10)+' ج.م');
 pickIngredient(milk.id);fireEvent.change(screen.getByLabelText('كمية المكون'),{target:{value:'100'}});expect(button.disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'إضافة المكون'}));expect(button.disabled).toBe(false);fireEvent.click(button);await waitFor(()=>expect(save).toHaveBeenCalledOnce());
 expect(save).toHaveBeenCalledWith({draft:s.catalogNameDrafts[0]},expect.arrayContaining([expect.objectContaining({ingredientId:raw.id,quantity:25}),expect.objectContaining({ingredientId:milk.id,quantity:100,unit:'ml'})]));
});
it('keeps the draft and ingredients available for retry if server confirmation fails',async()=>{
 const s=pending(),save=vi.fn().mockRejectedValue(Error('تعذر تأكيد الحفظ'));render(<RecipesScreen {...common} items={s.items} drafts={s.catalogNameDrafts} onSave={save}/>);add(raw.id,'18');
 fireEvent.click(screen.getByRole('button',{name:'اعتماد الوصفة وتجهيز المنتج'}));await screen.findByText('تعذر تأكيد الحفظ');expect((screen.getByLabelText('كمية Coffee') as HTMLInputElement).value).toBe('18');expect(screen.getByRole('button',{name:'المنتج صاحب الوصفة'}).textContent).toContain('Latte');
});
it('opens the recipe belonging to the selected product rather than navigating to production',()=>{
 const item:InventoryItem={...raw,id:'drink',code:'D1',name:'Latte',category:'drink_recipe',baseUnit:'piece',stock:0,hasRecipe:true,recipe:[{ingredientId:raw.id,ingredientName:raw.name,quantity:18,unit:'gram'}]},open=vi.fn(),production=vi.fn();
 render(<ProductsCatalogScreen items={[item]} onOpenRecipe={open} onAddNewItem={()=>true} onUpdateItem={()=>true} onDeleteItem={()=>true} onNavigateToProduction={production} onNavigateToInventory={()=>{}} onNavigateToPurchase={()=>{}} onBack={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'تفاصيل'}));fireEvent.click(screen.getByRole('button',{name:'فتح الوصفة (1 مكونات)'}));expect(open).toHaveBeenCalledWith('item:drink');expect(production).not.toHaveBeenCalled();
});
it('lets viewers inspect recipe costs without offering editing or activation',()=>{
 const s=pending();render(<RecipesScreen {...common} items={s.items} drafts={s.catalogNameDrafts} canManage={false} onSave={vi.fn()}/>);
 expect(screen.queryByLabelText('المكون')).toBeNull();expect(screen.queryByRole('button',{name:'اعتماد الوصفة وتجهيز المنتج'})).toBeNull();expect(screen.queryByRole('button',{name:'تعريف منتج بوصفة'})).toBeNull();
});
it('uses the last confirmed recipe as the basis for another edit in the same screen',async()=>{
 const item:InventoryItem={...raw,id:'drink',code:'D1',name:'Latte',category:'drink_recipe',baseUnit:'piece',stock:0,hasRecipe:true,recipe:[{ingredientId:raw.id,ingredientName:raw.name,quantity:18,unit:'gram'}]},save=vi.fn().mockResolvedValue(undefined);
 render(<RecipesScreen {...common} items={[raw,item]} drafts={[]} onSave={save}/>);
 fireEvent.change(screen.getByLabelText('كمية Coffee'),{target:{value:'20'}});fireEvent.click(screen.getByRole('button',{name:'حفظ الوصفة وتحديث التكلفة'}));await screen.findByText('تم تأكيد حفظ الوصفة وتحديث تكلفتها دون تنفيذ إنتاج أو بيع.');
 fireEvent.change(screen.getByLabelText('كمية Coffee'),{target:{value:'25'}});fireEvent.click(screen.getByRole('button',{name:'حفظ الوصفة وتحديث التكلفة'}));await waitFor(()=>expect(save).toHaveBeenCalledTimes(2));
 expect(save.mock.calls[1][0].item.recipe[0].quantity).toBe(20);expect(save.mock.calls[1][1][0].quantity).toBe(25);
});
