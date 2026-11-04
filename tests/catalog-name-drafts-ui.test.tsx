// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {CatalogNameDraftPanel} from '../src/components/CatalogNameDraftPanel';
import type {CatalogNameDraft} from '../src/types/erp';
afterEach(cleanup);
const drafts:CatalogNameDraft[]=[{id:'legacy',name:'بن برازيلى',sourceRepository:'AlAgoouz/Erp-AlAgoouz',sourceCommit:'a'.repeat(40),sourcePath:'source.ts',importedAt:'2026-11-05T00:00:00.000Z'}];
it('opens the source name with unknown type, unit, stock and prices left empty',()=>{
 const save=vi.fn();render(<CatalogNameDraftPanel drafts={drafts} items={[]} onComplete={save}/>);fireEvent.click(screen.getByRole('button',{name:'استكمال بن برازيلى'}));
 expect((screen.getByLabelText('اسم الصنف') as HTMLInputElement).value).toBe('بن برازيلى');
 for(const label of ['نوع الصنف','الوحدة الأساسية','الرصيد الافتتاحي','حد النواقص','تكلفة الوحدة قبل الضريبة','سعر البيع المباشر'])expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe('');
 fireEvent.click(screen.getByRole('button',{name:'حفظ الصنف والوصفة'}));expect(save).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('اختر');
});
it('requires a recipe when a draft is defined as a blend',()=>{
 const save=vi.fn();render(<CatalogNameDraftPanel drafts={drafts} items={[]} onComplete={save}/>);fireEvent.click(screen.getByRole('button',{name:'استكمال بن برازيلى'}));
 fireEvent.change(screen.getByLabelText('نوع الصنف'),{target:{value:'manufactured_blend'}});
 for(const label of ['الرصيد الافتتاحي','حد النواقص','سعر البيع المباشر'])fireEvent.change(screen.getByLabelText(label),{target:{value:'0'}});
 fireEvent.click(screen.getByRole('button',{name:'حفظ الصنف والوصفة'}));expect(save).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('مكونات الوصفة');
});
it('confirms entered details and retains them when the server rejects activation',async()=>{
 const save=vi.fn().mockRejectedValue(Error('لم يتأكد الحفظ'));render(<CatalogNameDraftPanel drafts={drafts} items={[]} onComplete={save}/>);fireEvent.click(screen.getByRole('button',{name:'استكمال بن برازيلى'}));
 fireEvent.change(screen.getByLabelText('نوع الصنف'),{target:{value:'raw_bean'}});fireEvent.change(screen.getByLabelText('الوحدة الأساسية'),{target:{value:'kg'}});
 for(const [label,value]of [['الرصيد الافتتاحي','0'],['حد النواقص','0'],['تكلفة الوحدة قبل الضريبة','25'],['سعر البيع المباشر','40']])fireEvent.change(screen.getByLabelText(label),{target:{value}});
 fireEvent.click(screen.getByRole('button',{name:'حفظ الصنف والوصفة'}));await waitFor(()=>expect(screen.getByRole('alert').textContent).toBe('لم يتأكد الحفظ'));
 expect(save).toHaveBeenCalledWith('legacy',expect.objectContaining({name:'بن برازيلى',category:'raw_bean',baseUnit:'kg',stock:0,costPrice:25,retailPrice:40}));expect(screen.getByRole('dialog')).toBeTruthy();
});
it('bounds the queue to twelve rows and allows readonly searching',()=>{
 render(<CatalogNameDraftPanel drafts={Array.from({length:81},(_,i)=>({...drafts[0],id:'draft'+i,name:'Name '+i}))} items={[]}/>);
 expect(screen.getAllByRole('listitem')).toHaveLength(12);expect(screen.queryByRole('button',{name:/استكمال/})).toBeNull();
 fireEvent.change(screen.getByLabelText('بحث في الأسماء المستوردة'),{target:{value:'Name 80'}});expect(screen.getAllByRole('listitem')).toHaveLength(1);
});
