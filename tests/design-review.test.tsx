// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {LoginScreen} from '../src/components/LoginScreen';
import {SectionsHub} from '../src/components/SectionsHub';
import {ProductsCatalogScreen} from '../src/components/ManagementScreens';
import {INITIAL_ITEMS} from '../src/data/initialData';
afterEach(cleanup);
it('calculates catalog margin correctly for selling prices below one currency unit',()=>{
 const raw=INITIAL_ITEMS.find(i=>i.category==='raw_bean')!;
 const noop=vi.fn();
 render(<ProductsCatalogScreen items={[{...raw,costPrice:0.25,retailPrice:0.5}]} onAddNewItem={noop} onUpdateItem={noop} onDeleteItem={noop} onNavigateToProduction={noop} onNavigateToInventory={noop} onNavigateToPurchase={noop} onBack={noop}/>);
 expect(screen.getByText('50%',{exact:true})).toBeTruthy();
});
it('filters all seven approved categories and keeps legacy ingredients under direct products',()=>{
 const raw=INITIAL_ITEMS.find(i=>i.category==='raw_bean')!;
 const directDrink={...raw,id:'direct-drink',code:'DD',name:'Test bottled drink',category:'direct_drink' as const};
 const snack={...raw,id:'snack',code:'SN',name:'Test snack',category:'snack' as const};
 const legacy={...raw,id:'legacy',code:'LE',name:'Test legacy sugar',category:'raw_spice' as const};
 const noop=vi.fn();
 render(<ProductsCatalogScreen items={[raw,directDrink,snack,legacy]} onAddNewItem={noop} onUpdateItem={noop} onDeleteItem={noop} onNavigateToProduction={noop} onNavigateToInventory={noop} onNavigateToPurchase={noop} onBack={noop}/>);
 fireEvent.click(screen.getByRole('button',{name:'مشروبات بيع مباشر',exact:true}));
 expect(screen.getByText(directDrink.name)).toBeTruthy();expect(screen.queryByText(snack.name)).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'سناكس',exact:true}));expect(screen.getByText(snack.name)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'منتج مباشر',exact:true}));expect(screen.getByText(legacy.name)).toBeTruthy();
});
it('offers sign in and styled recovery without self-registration',()=>{
 render(<LoginScreen onSignIn={vi.fn()} onRequestPasswordReset={vi.fn()} onResendConfirmation={vi.fn()}/>);
 expect(screen.queryByText(/إنشاء حساب|بوابة الدخول الآمن/)).toBeNull();
 expect(screen.getByRole('button',{name:'نسيت كلمة المرور؟'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'إعادة إرسال تأكيد البريد'})).toBeTruthy();
});
it('sends a recovery request without a password and preserves the email on return',async()=>{
 const reset=vi.fn(async()=>{}),signIn=vi.fn();
 render(<LoginScreen onSignIn={signIn} onRequestPasswordReset={reset} authError="خطأ دخول قديم"/>);
 fireEvent.change(screen.getByLabelText('البريد الإلكتروني'),{target:{value:'owner@example.test'}});
 fireEvent.click(screen.getByRole('button',{name:'نسيت كلمة المرور؟'}));
 expect(screen.queryByLabelText('كلمة المرور')).toBeNull();
 expect(screen.queryByText('خطأ دخول قديم')).toBeNull();
 fireEvent.submit(screen.getByLabelText('البريد الإلكتروني').closest('form')!);
 await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('إذا كان البريد'));
 expect(reset).toHaveBeenCalledExactlyOnceWith('owner@example.test');expect(signIn).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'العودة لتسجيل الدخول'}));
 expect((screen.getByLabelText('البريد الإلكتروني') as HTMLInputElement).value).toBe('owner@example.test');
});
it('prevents concurrent recovery requests and mode changes until a response arrives',async()=>{
 let finish!:()=>void;const resend=vi.fn(()=>new Promise<void>(resolve=>finish=resolve));
 render(<LoginScreen onSignIn={vi.fn()} onResendConfirmation={resend}/>);
 fireEvent.click(screen.getByRole('button',{name:'إعادة إرسال تأكيد البريد'}));
 fireEvent.change(screen.getByLabelText('البريد الإلكتروني'),{target:{value:'owner@example.test'}});
 const form=screen.getByLabelText('البريد الإلكتروني').closest('form')!;
 fireEvent.submit(form);fireEvent.submit(form);
 expect(resend).toHaveBeenCalledTimes(1);
 expect((screen.getByRole('button',{name:'العودة لتسجيل الدخول'}) as HTMLButtonElement).disabled).toBe(true);
 finish();await waitFor(()=>expect(screen.getByRole('status')).toBeTruthy());
});
it('routes every section and searches Arabic section names with a useful empty state',()=>{
 const navigate=vi.fn();render(<SectionsHub counts={{shortages:3}} onNavigate={navigate}/>);
 expect(screen.getAllByRole('button').length).toBe(16);
 fireEvent.click(screen.getByRole('button',{name:/المصاريف/}));expect(navigate).toHaveBeenLastCalledWith('expenses');
 fireEvent.click(screen.getByRole('button',{name:/النواقص/}));expect(navigate).toHaveBeenLastCalledWith('shortages');
 fireEvent.change(screen.getByRole('textbox',{name:'ابحث في الأقسام'}),{target:{value:'انتاج'}});
 expect(screen.getByRole('button',{name:/الإنتاج والوصفات/})).toBeTruthy();
 expect(screen.queryByRole('button',{name:/فواتير الجملة/})).toBeNull();
 fireEvent.change(screen.getByRole('textbox',{name:'ابحث في الأقسام'}),{target:{value:'missing'}});
 expect(screen.getByRole('status').textContent).toContain('مفيش قسم');
 fireEvent.click(screen.getByRole('button',{name:'عرض كل الأقسام'}));expect(screen.getAllByRole('button').length).toBe(16);
});
