import {expect,it,vi} from 'vitest';
import {emptyStore,validateStore,createBackup,parseBackup,fromCloud,toCloud} from '../src/lib/storeState';
import {recordRecipeDefinition,activateRecipeDraft,updateCatalogRecipe,saveRecipeDefinition,saveRecipe} from '../src/lib/recipeCatalog';
import {StoreEngine} from '../src/lib/storeEngine';
import {calculateRecipeTotalCost} from '../src/lib/itemCosts';
import {inventoryDeductions,productionNeeds} from '../src/lib/inventory';
import type {InventoryItem,RecipeIngredient,RecipeProductDefinition,CatalogNameDraft} from '../src/types/erp';
const raw:InventoryItem={id:'coffee',code:'C',name:'Coffee',category:'raw_bean',baseUnit:'kg',stock:10,openingStock:10,minStock:1,costPrice:400,lastPurchasePrice:400,retailPrice:600,wholesalePrice:0,hasRecipe:false,canSellDirectly:true,supplierPrices:[]};
const milk:InventoryItem={...raw,id:'milk',code:'M',name:'Milk',category:'direct_product',baseUnit:'liter',stock:5,costPrice:30};
const cup:InventoryItem={...raw,id:'cup',code:'U',name:'Cup',category:'direct_product',baseUnit:'count',stock:100,costPrice:1.5};
const actor={id:'owner',name:'Owner'},initial=()=>({...emptyStore,items:[raw,milk,cup]});
const definition:RecipeProductDefinition={code:'D1',category:'drink_recipe',baseUnit:'piece',openingStock:0,minStock:0,retailPrice:50};
const recipe:RecipeIngredient[]=[{ingredientId:raw.id,ingredientName:raw.name,quantity:18,unit:'gram'},{ingredientId:milk.id,ingredientName:milk.name,quantity:200,unit:'ml'},{ingredientId:cup.id,ingredientName:cup.name,quantity:1,unit:'count'}];
it('stores a manual definition without making an operational item, zero cost or inventory movement',()=>{
 const before=initial(),draft=recordRecipeDefinition(before,'draft','Latte',definition,actor);
 expect(draft.items).toEqual(before.items);expect(draft.productionBatches).toEqual([]);expect(draft.salesInvoices).toEqual([]);
 expect(draft.catalogNameDrafts[0]).toMatchObject({id:'draft',origin:'manual',definition});
 expect(draft.catalogNameDrafts[0]).not.toHaveProperty('sourceRepository');expect(draft.catalogNameDrafts[0].definition).not.toHaveProperty('costPrice');
 expect(()=>inventoryDeductions([{itemId:'draft',normalizedQtyInBaseUnit:1}],draft.items)).toThrow();
 expect(parseBackup(createBackup(draft))).toEqual(draft);expect(fromCloud(toCloud(draft))).toEqual(draft);
});
it('activates a drink only from a valid complete recipe and computes mixed-unit cost per cup',()=>{
 const draft=recordRecipeDefinition(initial(),'draft','Latte',definition,actor),after=activateRecipeDraft(draft,'draft',recipe,actor);
 const drink=after.items.find(i=>i.code==='D1')!;expect(drink).toMatchObject({category:'drink_recipe',hasRecipe:true,stock:0,costPrice:14.7,recipeYield:1});
 expect(after.catalogNameDrafts).toHaveLength(0);expect(after.items.filter(i=>i.id!==drink.id)).toEqual(initial().items);
 expect(after.productionBatches).toEqual([]);expect(()=>productionNeeds(drink,1,after.items)).toThrow('الإنتاج');
 expect([...inventoryDeductions([{itemId:drink.id,normalizedQtyInBaseUnit:2}],after.items)]).toEqual([['coffee',0.036],['milk',0.4],['cup',2]]);
 expect(()=>activateRecipeDraft(draft,'draft',[],actor)).toThrow('مكونات');
});
it('preserves imported provenance through definition and refuses resurrection of a deleted source draft',async()=>{
 const imported:CatalogNameDraft={id:'imported',name:'Imported drink',sourceRepository:'AlAgoouz/Erp-AlAgoouz',sourceCommit:'a'.repeat(40),sourcePath:'names.ts',importedAt:'2026-11-05T00:00:00Z'};
 const state={...initial(),catalogNameDrafts:[imported]},next=recordRecipeDefinition(state,imported.id,imported.name,definition,actor);
 expect(next.catalogNameDrafts[0]).toMatchObject(imported);expect(next.catalogNameDrafts[0]).not.toHaveProperty('origin');
 const engine=new StoreEngine({load:async()=>({state:initial(),version:0}),save:async()=>1});await engine.load();
 await expect(saveRecipeDefinition(engine,imported.id,imported.name,definition,actor,imported)).rejects.toThrow('تغير');expect(engine.state.catalogNameDrafts).toEqual([]);
});
it('reserves codes against both operational items and other pending definitions',()=>{
 const s=recordRecipeDefinition(initial(),'draft','Latte',definition,actor);
 expect(()=>recordRecipeDefinition(s,'other','Other drink',{...definition,code:'d1'},actor)).toThrow('محجوز');
 expect(()=>recordRecipeDefinition(s,'other','Other drink',{...definition,code:'C'},actor)).toThrow('معتمد');
 expect(()=>validateStore({...s,items:[...s.items,{...raw,id:'other',code:'D1'}]})).toThrow('محجوز');
});
it('keeps blend inventory averages and old documents separate from a changed production recipe',()=>{
 const d={...definition,code:'B1',category:'manufactured_blend' as const,baseUnit:'kg' as const,openingStock:2};
 const s=activateRecipeDraft(recordRecipeDefinition(initial(),'blend','Blend',d,actor),'blend',[{...recipe[0],quantity:1000}],actor),blend=s.items.find(i=>i.code==='B1')!;
 const updated=updateCatalogRecipe(s,blend,[{...recipe[0],quantity:500}],actor),next=updated.items.find(i=>i.id===blend.id)!;
 expect(next.costPrice).toBe(400);expect(calculateRecipeTotalCost(next.recipe,updated.items)).toBe(200);expect(next.stock).toBe(2);
 expect(updated.productionBatches).toEqual([]);expect(updated.stocktakingRecords).toEqual([]);
});
it('rejects duplicate, invalid-unit, circular and stale recipes instead of saving partial data',()=>{
 const draft=recordRecipeDefinition(initial(),'draft','Latte',definition,actor);
 for(const wrong of [[recipe[0],recipe[0]],[{...recipe[0],quantity:0}],[{...recipe[0],unit:'liter' as const}]])expect(()=>activateRecipeDraft(draft,'draft',wrong,actor)).toThrow();
 const s=activateRecipeDraft(draft,'draft',recipe,actor),drink=s.items.find(i=>i.code==='D1')!;
 expect(()=>updateCatalogRecipe(s,drink,[{...recipe[0],ingredientId:drink.id}],actor)).toThrow();
 const changed={...s,items:s.items.map(i=>i.id===drink.id?{...i,recipe:[recipe[0]]}:i)};
 expect(()=>updateCatalogRecipe(changed,drink,recipe,actor)).toThrow('تغيرت');
});
it('retries definition and activation acknowledgements without duplicates',async()=>{
 const persist=vi.fn().mockRejectedValueOnce(Error('network')).mockResolvedValue(1),engine=new StoreEngine({load:async()=>({state:initial(),version:0}),save:persist});await engine.load();
 await expect(saveRecipeDefinition(engine,'draft','Latte',definition,actor)).rejects.toThrow('network');await saveRecipeDefinition(engine,'draft','Latte',definition,actor);
 expect(persist.mock.calls[0][2]).toBe(persist.mock.calls[1][2]);expect(engine.state.catalogNameDrafts).toHaveLength(1);
 const original=engine.state.catalogNameDrafts[0];persist.mockRejectedValueOnce(Error('network')).mockResolvedValue(2);
 await expect(saveRecipe(engine,{draft:original},recipe,actor)).rejects.toThrow('network');await saveRecipe(engine,{draft:original},recipe,actor);
 expect(persist.mock.calls[2][2]).toBe(persist.mock.calls[3][2]);expect(engine.state.items.filter(i=>i.code==='D1')).toHaveLength(1);expect(engine.state.catalogNameDrafts).toHaveLength(0);
});
