import {it,expect,vi} from 'vitest';
import fs from 'node:fs';
import {extractNames} from '../scripts/catalog/extract-legacy-names.mjs';
import {emptyStore,validateStore,createBackup,parseBackup} from '../src/lib/storeState';
import {completeCatalogNameDraft,saveCatalogNameDraft} from '../src/lib/catalogNameDrafts';
import {StoreEngine} from '../src/lib/storeEngine';
import {assertUserChanges} from '../src/lib/userAccess';
import type {CatalogNameDraft,InventoryItem} from '../src/types/erp';
const draft:CatalogNameDraft={id:'legacy-name',name:'بن برازيلى ريو وسط',sourceRepository:'AlAgoouz/Erp-AlAgoouz',sourceCommit:'53102139a375b3354dafdc7293c68a815b083209',sourcePath:'backend/src/scripts/preciseProductImageCurator.ts',importedAt:'2026-11-05T00:00:00.000Z'};
const staged={...emptyStore,catalogNameDrafts:[draft]};
const item:Omit<InventoryItem,'id'>={name:draft.name,code:'IT-1',category:'raw_bean',baseUnit:'kg',stock:0,minStock:0,costPrice:25,lastPurchasePrice:25,retailPrice:40,wholesalePrice:0,canSellDirectly:true,hasRecipe:false,recipe:[],supplierPrices:[]};
it('extracts explicit property names without executing untrusted source code',()=>{
 expect(extractNames("const EXACT_PRODUCT_IMAGES={'عصير فراولة ':'url','عصير فراولة':'url',بن:'url'}")).toEqual({rawCount:3,duplicateCount:1,names:['عصير فراولة','بن']});
 expect(()=>extractNames("const EXACT_PRODUCT_IMAGES={evil:runCode()}")).toThrow();
});
it('pins 81 source names with one whitespace duplicate and preserves spelling differences for review',()=>{
 const manifest=JSON.parse(fs.readFileSync('data/imports/erp-alagoouz-catalog-names.json','utf8'));
 expect(manifest.names).toHaveLength(81);expect(manifest.rawCount).toBe(82);expect(manifest.duplicateCount).toBe(1);
 expect(new Set(manifest.names).size).toBe(81);expect(manifest.names).toContain('قوة تركى دبل');expect(manifest.names).toContain('قهوة تركى سنجل');
});
it('keeps names outside active items and preserves them in complete and legacy backups',()=>{
 expect(validateStore(staged).items).toEqual([]);expect(parseBackup(createBackup(staged))).toEqual(staged);
 const {catalogNameDrafts,...legacy}=emptyStore;expect(validateStore(legacy).catalogNameDrafts).toEqual([]);
 expect(()=>validateStore({...staged,catalogNameDrafts:[draft,{...draft,id:'duplicate',name:' '+draft.name+' '}]})).toThrow('مكررة');
});
it('completes one draft atomically without changing finances and rejects duplicate activation',()=>{
 const ready=completeCatalogNameDraft(staged,draft.id,item);
 expect(ready.catalogNameDrafts).toEqual([]);expect(ready.items).toHaveLength(1);expect(ready.items[0]).toMatchObject(item);
 expect({...ready,items:[],catalogNameDrafts:[],auditLogs:[]}).toEqual(emptyStore);expect(ready.auditLogs[0].description).toContain(item.name);
 expect(()=>completeCatalogNameDraft(ready,draft.id,item)).toThrow('لم يعد');
 expect(()=>completeCatalogNameDraft({...staged,items:ready.items},draft.id,item)).toThrow('نفس الاسم');
});
it('reserves draft changes to catalog permissions',()=>{
 const user={userId:'employee',partnerId:null,displayName:'Employee',username:'employee',role:'partner' as const,isOwner:false,permissions:{view:true,expenses:true}};
 expect(()=>assertUserChanges(emptyStore,staged,user)).toThrow('تصريح');
 expect(()=>assertUserChanges(emptyStore,staged,{...user,permissions:{view:true,catalog:true}})).not.toThrow();
});
it('retries the same uncertain activation without adding a second product',async()=>{
 const save=vi.fn().mockRejectedValueOnce(Error('network')).mockResolvedValue(1),engine=new StoreEngine({load:async()=>({state:staged,version:0}),save});await engine.load();
 await expect(saveCatalogNameDraft(engine,draft.id,item)).rejects.toThrow('network');await saveCatalogNameDraft(engine,draft.id,item);
 expect(save).toHaveBeenCalledTimes(2);expect(save.mock.calls[0][2]).toBe(save.mock.calls[1][2]);expect(engine.state.items).toHaveLength(1);expect(engine.hasPending).toBe(false);
});
