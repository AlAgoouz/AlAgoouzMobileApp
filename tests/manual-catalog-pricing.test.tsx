// @vitest-environment jsdom
import React from 'react';import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {CatalogNameDraftPanel} from '../src/components/CatalogNameDraftPanel';
import {emptyStore,validateStore,parseBackup,createBackup} from '../src/lib/storeState';
afterEach(cleanup);
const staleDraft={id:'draft',name:'بن تركي - 250 جرام',sourceRepository:'AlAgoouz/Erp-AlAgoouz',sourceCommit:'a'.repeat(40),sourcePath:'names.ts',importedAt:'2026-11-05T00:00:00.000Z',legacyPrices:{purchasePrice:45,salePrice:65}};
it('drops withdrawn imported prices from restored drafts while preserving names and user data',()=>{
 const cleaned=validateStore({...emptyStore,catalogNameDrafts:[staleDraft]});expect(cleaned.catalogNameDrafts[0]).not.toHaveProperty('legacyPrices');expect(cleaned.catalogNameDrafts[0].name).toBe(staleDraft.name);
 expect(parseBackup(createBackup(cleaned))).toEqual(cleaned);
});
it('leaves pricing manual after selecting a unit and saves the amounts entered by the user',async()=>{
 const save=vi.fn().mockResolvedValue(undefined);render(<CatalogNameDraftPanel drafts={[staleDraft]} items={[]} onComplete={save}/>);
 expect(screen.queryByLabelText('أسعار مستوردة تحتاج مراجعة')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'استكمال بن تركي - 250 جرام'}));
 fireEvent.change(screen.getByLabelText('نوع الصنف'),{target:{value:'raw_bean'}});fireEvent.change(screen.getByLabelText('الوحدة الأساسية'),{target:{value:'kg'}});
 for(const label of ['تكلفة الوحدة قبل الضريبة','سعر البيع المباشر'])expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe('');
 for(const [label,value]of [['تكلفة الوحدة قبل الضريبة','123'],['سعر البيع المباشر','150'],['الرصيد الافتتاحي','0'],['حد النواقص','0']])fireEvent.change(screen.getByLabelText(label),{target:{value}});
 fireEvent.click(screen.getByRole('button',{name:'حفظ الصنف والوصفة'}));await waitFor(()=>expect(save).toHaveBeenCalledWith('draft',expect.objectContaining({costPrice:123,lastPurchasePrice:123,retailPrice:150,stock:0,baseUnit:'kg'})));
});
