// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {cashierReportHeader,inspectCashierFile} from '../src/lib/cashierReportHeader';
import {ImportJobsPanel} from '../src/components/ImportJobsPanel';
import {CashierDayScreen} from '../src/components/CashierDayScreen';
import {reviewedCashierRows} from '../src/lib/cashierRows';
import {INITIAL_ITEMS} from '../src/data/initialData';
import {listImports,uploadImport} from '../src/lib/importJobs';
vi.mock('../src/lib/importJobs',()=>({listImports:vi.fn(async()=>[]),readImport:vi.fn(),uploadImport:vi.fn(async()=> 'job'),cancelImport:vi.fn(),enqueueImport:vi.fn(),importError:()=> 'راجع الملف'}));
vi.mock('../src/lib/cashierReportHeader',async original=>({...await original<typeof import('../src/lib/cashierReportHeader')>(),inspectCashierFile:vi.fn()}));
const raw={...INITIAL_ITEMS[0],id:'raw',code:'200018',category:'raw_bean' as const,baseUnit:'kg' as const,stock:10,costPrice:100};
const source={code:'200018',name:'POS Beans',quantity:'0.375',unit:'kg',total:'100.00',sourceFormat:'uws-items-v1',businessDate:'2026-11-01',sourceRow:4,saleCount:3};
beforeEach(()=>{vi.mocked(inspectCashierFile).mockReset();vi.mocked(uploadImport).mockClear();});
afterEach(cleanup);
it('reads the business day and kind from report content instead of the print date',()=>{
 expect(cashierReportHeader([['Menu Item Sales Report (UWS)\nDate Range 01 11 26 - 01 11 26\nPrinted on 04/11/26 22:00:00']])).toEqual({date:'2026-11-01',kind:'items'});
 expect(cashierReportHeader([['System Sales Report (UWS)\nDate Range 01 11 2026 - 01 11 2026']])).toEqual({date:'2026-11-01',kind:'financial'});
 expect(cashierReportHeader([['code','quantity'],['ABC',1]])).toEqual({date:null,kind:null});
 for(const date of ['Date Range 31 02 26 - 31 02 26','Date Range 01 11 26 - 02 11 26','Date Range unknown'])expect(()=>cashierReportHeader([[date]])).toThrow();
 expect(()=>cashierReportHeader([['Menu Item Sales Report (UWS)\nPrinted on 01/11/26']])).toThrow();
});
it('selects and locks the detected day and type before uploading, then unlocks after success',async()=>{
 vi.mocked(inspectCashierFile).mockResolvedValue({date:'2026-11-01',kind:'items'});render(<ImportJobsPanel/>);
 const file=new File(['fixture'],'name-with-wrong-2030-date.xls');fireEvent.change(screen.getByLabelText('ملف التقرير'),{target:{files:[file]}});
 await screen.findByText(/يوم البيع 2026-11-01 مقروء/);
 expect((screen.getByLabelText('يوم العمل') as HTMLInputElement).value).toBe('2026-11-01');expect((screen.getByLabelText('يوم العمل') as HTMLInputElement).readOnly).toBe(true);
 expect((screen.getByLabelText('نوع التقرير') as HTMLSelectElement).value).toBe('items');
 fireEvent.click(screen.getByRole('button',{name:'رفع وبدء المعالجة'}));await waitFor(()=>expect(uploadImport).toHaveBeenCalledWith(file,'items','2026-11-01'));
 await screen.findByText('تم إرسال الملف للمعالجة؛ تابع حالته أدناه.');expect((screen.getByLabelText('يوم العمل') as HTMLInputElement).readOnly).toBe(false);
});
it('discards a slow older header result after a newer file is selected',async()=>{
 let resolveFirst!:(value:{date:string;kind:'items'})=>void;
 vi.mocked(inspectCashierFile).mockImplementationOnce(()=>new Promise(resolve=>{resolveFirst=resolve;})).mockResolvedValueOnce({date:'2026-11-02',kind:'items'});
 render(<ImportJobsPanel/>);const input=screen.getByLabelText('ملف التقرير');
 fireEvent.change(input,{target:{files:[new File(['first'],'first.xls')]}});fireEvent.change(input,{target:{files:[new File(['second'],'second.xls')]}});
 await screen.findByText(/يوم البيع 2026-11-02 مقروء/);resolveFirst({date:'2026-11-01',kind:'items'});
 await waitFor(()=>expect((screen.getByLabelText('يوم العمل') as HTMLInputElement).value).toBe('2026-11-02'));
});
it('blocks an invalid file and keeps its error visible after a background list refresh',async()=>{
 vi.mocked(inspectCashierFile).mockRejectedValue(Error('التقرير يشمل أكثر من يوم'));
 render(<ImportJobsPanel/>);await screen.findByText('لا توجد ملفات مرفوعة بعد.');
 fireEvent.change(screen.getByLabelText('ملف التقرير'),{target:{files:[new File(['fixture'],'invalid.xls')]}});
 await screen.findByText('التقرير يشمل أكثر من يوم');expect((screen.getByRole('button',{name:'رفع وبدء المعالجة'}) as HTMLButtonElement).disabled).toBe(true);
 const reads = vi.mocked(listImports).mock.calls.length;
 fireEvent(window, new Event('online'));
 await waitFor(()=>expect(listImports).toHaveBeenCalledTimes(reads+1));
 expect(screen.getByRole('alert').textContent).toContain('التقرير يشمل أكثر من يوم');expect(uploadImport).not.toHaveBeenCalled();
});
it('does not reinterpret authoritative source codes, units, or unresolved details through manual matching',()=>{
 const missing=reviewedCashierRows([source],[{...raw,code:'OTHER'}],{0:{itemId:raw.id,unit:'count'}})[0];expect(missing.matchedItem).toBeUndefined();expect(missing.error).toContain('كود الكاشير');
 const unresolved=reviewedCashierRows([{...source,sourceIssue:'UWS_VARIANT_WEIGHTS_REQUIRED'}],[raw],{0:{itemId:raw.id,unit:'gram'}})[0];expect(unresolved.error).toContain('وزن كل نوع');expect(unresolved.quantity).toBe(0.375);expect(unresolved.unitHint).toBe('kg');
 expect(reviewedCashierRows([source],[raw],{})[0]).toMatchObject({quantity:0.375,unitHint:'kg',saleCount:3,matchedItem:raw,error:undefined});
});
it('attaches source weight rather than sale count and blocks a mismatched source day',async()=>{
 const attach=vi.fn(async()=>{});const queue={id:'queue',file_name:'items.xls',sale_date:'2026-11-01',content_hash:'a'.repeat(64),report_kind:'items' as const,raw_rows:[source]};
 const {rerender}=render(<CashierDayScreen items={[raw]} days={[]} queued={[queue]} onAttach={attach} onApprove={vi.fn()} onBack={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'2026-11-01 — items.xls'}));await screen.findByText(/عدد مرات البيع: 3/);fireEvent.click(screen.getByRole('button',{name:'حفظ التقرير لهذا اليوم'}));
 await waitFor(()=>expect(attach).toHaveBeenCalledWith('2026-11-01',expect.objectContaining({lines:[{itemId:'raw',quantity:0.375,unitLabel:'kg',normalizedQtyInBaseUnit:0.375}]})));
 rerender(<CashierDayScreen items={[raw]} days={[]} queued={[{...queue,sale_date:'2026-11-02'}]} onAttach={attach} onApprove={vi.fn()} onBack={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'2026-11-02 — items.xls'}));await screen.findByText(/تاريخ تقرير الأصناف لا يطابق/);expect((screen.getByRole('button',{name:'حفظ التقرير لهذا اليوم'}) as HTMLButtonElement).disabled).toBe(true);
});
it('keeps unresolved variant and seasoning rows visible and prevents approval',async()=>{
 render(<CashierDayScreen items={[raw]} days={[]} queued={[{id:'queue',file_name:'blocked.xls',sale_date:'2026-11-01',content_hash:'a'.repeat(64),report_kind:'items',raw_rows:[{...source,sourceIssue:'UWS_SEASONING_WEIGHT_REQUIRED'}]}]} onAttach={vi.fn()} onApprove={vi.fn()} onBack={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'2026-11-01 — blocked.xls'}));await screen.findByText(/مرات إضافة التحويجة لا تحدد وزنها/);expect((screen.getByRole('button',{name:'حفظ التقرير لهذا اليوم'}) as HTMLButtonElement).disabled).toBe(true);expect(screen.queryByLabelText('مطابقة الصف 1')).toBeNull();
});
