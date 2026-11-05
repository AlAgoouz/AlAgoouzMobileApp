// @vitest-environment jsdom
import React from 'react';import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {CatalogNameDraftPanel} from '../src/components/CatalogNameDraftPanel';
import type {CatalogNameDraft} from '../src/types/erp';
afterEach(cleanup);
const draft:CatalogNameDraft={id:'priced',name:'بن تركي - 250 جرام',sourceRepository:'AlAgoouz/Erp-AlAgoouz',sourceCommit:'a'.repeat(40),sourcePath:'names.ts',importedAt:'2026-11-05T00:00:00.000Z',legacyPrices:{purchasePrice:45,salePrice:65,unitLabel:'كيس',packageWeightGrams:250,sourceName:'بن تركي - 250 جرام',sourcePath:'seed.sql',sourceCommit:'a'.repeat(40),sourceKind:'github_seed',requiresReview:true}};
const value=(label:string)=>(screen.getByLabelText(label) as HTMLInputElement).value;
it('shows purchase and sale references and fills prices only after selecting their destination unit',()=>{
 render(<CatalogNameDraftPanel drafts={[draft]} items={[]} onComplete={vi.fn()}/>);
 expect(screen.getByLabelText('أسعار مستوردة تحتاج مراجعة').textContent).toContain('250 جرام');
 fireEvent.click(screen.getByRole('button',{name:'استكمال بن تركي - 250 جرام'}));expect(value('تكلفة الوحدة قبل الضريبة')).toBe('');
 fireEvent.change(screen.getByLabelText('نوع الصنف'),{target:{value:'raw_bean'}});fireEvent.change(screen.getByLabelText('الوحدة الأساسية'),{target:{value:'kg'}});
 expect(value('تكلفة الوحدة قبل الضريبة')).toBe('180');expect(value('سعر البيع المباشر')).toBe('260');
 fireEvent.change(screen.getByLabelText('الوحدة الأساسية'),{target:{value:'piece'}});expect(value('تكلفة الوحدة قبل الضريبة')).toBe('45');expect(value('سعر البيع المباشر')).toBe('65');
 fireEvent.change(screen.getByLabelText('الوحدة الأساسية'),{target:{value:'liter'}});expect(value('تكلفة الوحدة قبل الضريبة')).toBe('');expect(value('سعر البيع المباشر')).toBe('');
});
it('does not turn a packet price into a prepared drink price or recipe cost',()=>{
 render(<CatalogNameDraftPanel drafts={[draft]} items={[]} onComplete={vi.fn()}/>);fireEvent.click(screen.getByRole('button',{name:'استكمال بن تركي - 250 جرام'}));
 fireEvent.change(screen.getByLabelText('نوع الصنف'),{target:{value:'drink_recipe'}});expect(value('سعر البيع المباشر')).toBe('');expect(screen.queryByLabelText('تكلفة الوحدة قبل الضريبة')).toBeNull();
});
