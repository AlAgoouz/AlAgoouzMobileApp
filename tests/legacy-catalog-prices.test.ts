import {it,expect} from 'vitest';import fs from 'node:fs';
import {extractPrices} from '../scripts/catalog/extract-legacy-prices.mjs';
import {legacyPricesForUnit} from '../src/lib/legacyCatalogPrices';
import {emptyStore,parseBackup,createBackup,validateStore} from '../src/lib/storeState';
import {completeCatalogNameDraft} from '../src/lib/catalogNameDrafts';
import {receiveStock} from '../src/lib/costing';
import type {LegacyCatalogPrices} from '../src/types/erp';
const prices:LegacyCatalogPrices={purchasePrice:45,salePrice:65,unitLabel:'كيس',packageWeightGrams:250,sourceName:'بن تركي - 250 جرام',sourcePath:'backend/migrations/002_seed.sql',sourceCommit:'a'.repeat(40),sourceKind:'github_seed',requiresReview:true};
const draft={id:'draft',name:prices.sourceName,sourceRepository:'AlAgoouz/Erp-AlAgoouz',sourceCommit:'a'.repeat(40),sourcePath:'source.ts',importedAt:'2026-11-05T00:00:00.000Z',legacyPrices:prices};
it('extracts only explicit product price rows and refuses an unknown seed layout',()=>{
 const source="INSERT INTO users VALUES ('private'); INSERT INTO products (sku, barcode, name_ar, category_id, unit, purchase_price, sale_price, wholesale_price, min_stock) VALUES ('TC','code','بن تركي - 250 جرام',1,'كيس',45.00,65.00,58.00,10);";
 expect(extractPrices(source).rows).toEqual([{sku:'TC',name:prices.sourceName,unitLabel:'كيس',purchasePrice:45,salePrice:65,packageWeightGrams:250}]);
 expect(()=>extractPrices(source.replace('purchase_price','unknown'))).toThrow();expect(()=>extractPrices(source.replace('45.00','run_code()'))).toThrow();
});
it('imports precisely twelve matching source prices without inventing prices for other names',()=>{
 const p=JSON.parse(fs.readFileSync('data/imports/erp-alagoouz-catalog-prices.json','utf8')),n=JSON.parse(fs.readFileSync('data/imports/erp-alagoouz-catalog-names.json','utf8'));
 expect(p.rows).toHaveLength(12);expect(p.rows.every((r:any)=>n.names.includes(r.name))).toBe(true);expect(n.names.length-p.rows.length).toBe(69);expect(p.requiresReview).toBe(true);
});
it('converts only known package weights and keeps confirmed zero separate from unavailable conversions',()=>{
 expect(legacyPricesForUnit(prices,'piece')).toEqual({purchasePrice:45,salePrice:65});
 expect(legacyPricesForUnit(prices,'kg')).toEqual({purchasePrice:180,salePrice:260});
 expect(legacyPricesForUnit(prices,'liter')).toBeNull();expect(legacyPricesForUnit({...prices,packageWeightGrams:undefined},'kg')).toBeNull();
 expect(legacyPricesForUnit({...prices,purchasePrice:0,salePrice:0},'piece')).toEqual({purchasePrice:0,salePrice:0});
 expect(legacyPricesForUnit({...prices,purchasePrice:1e12,packageWeightGrams:1},'kg')).toBeNull();
});
it('backs up reference prices without booking inventory, sales, cash or partner profit',()=>{
 const state={...emptyStore,catalogNameDrafts:[draft]};expect(parseBackup(createBackup(state))).toEqual(state);
 expect({...state,catalogNameDrafts:[]}).toEqual(emptyStore);
 expect(()=>validateStore({...state,catalogNameDrafts:[{...draft,legacyPrices:{...prices,purchasePrice:-1}}]})).toThrow();
});
it('lets reviewed opening prices become a starting value and later purchases update the moving average',()=>{
 const state={...emptyStore,catalogNameDrafts:[draft]},values=legacyPricesForUnit(prices,'kg')!;
 const ready=completeCatalogNameDraft(state,'draft',{name:draft.name,code:'TC',category:'raw_bean',baseUnit:'kg',stock:0,minStock:0,costPrice:values.purchasePrice,lastPurchasePrice:values.purchasePrice,retailPrice:values.salePrice,wholesalePrice:0,canSellDirectly:true,hasRecipe:false,recipe:[],supplierPrices:[]});
 const first=receiveStock(ready.items[0],5,200,{id:'p1',date:'2026-11-05',type:'purchase'}),second=receiveStock(first,5,220,{id:'p2',date:'2026-11-06',type:'purchase'});
 expect(first.costPrice).toBe(200);expect(second.costPrice).toBe(210);expect(second.stock).toBe(10);expect(second.retailPrice).toBe(260);expect(second.costHistory).toHaveLength(2);
});
