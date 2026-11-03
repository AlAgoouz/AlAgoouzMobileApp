import {it,expect} from 'vitest';
import {assertUserChanges,canView,type UserAccess} from '../src/lib/userAccess';
import {emptyStore} from '../src/lib/storeState';
import {INITIAL_ITEMS,INITIAL_PARTNERS} from '../src/data/initialData';
import {recordExpense} from '../src/lib/ledger';
const user:UserAccess={userId:'user',partnerId:null,displayName:'Employee',username:'employee',role:'partner',isOwner:false,permissions:{view:true}};
const state={...emptyStore,items:[INITIAL_ITEMS[0]],partners:INITIAL_PARTNERS};
it('lets an unlinked user view the store without manufacturing a financial partner',()=>{
 expect(canView(user)).toBe(true);expect(user.partnerId).toBeNull();expect(state.partners).toBe(INITIAL_PARTNERS);
});
it('blocks read-only writes before publishing a local draft, including no-op saves',()=>{
 expect(()=>assertUserChanges(state,state,user)).toThrow('للعرض فقط');
 expect(()=>assertUserChanges(state,{...state,items:[]},user)).toThrow('للعرض فقط');
});
it('keeps product definitions separate from other section write permissions',()=>{
 expect(()=>assertUserChanges(state,{...state,items:[{...state.items[0],name:'Changed'}]},{...user,permissions:{view:true,sales:true}})).toThrow('تصريح');
 expect(()=>assertUserChanges(state,{...state,items:[{...state.items[0],name:'Changed'}]},{...user,permissions:{view:true,catalog:true}})).not.toThrow();
});
it('permits an authorized expense and its financial side effects without granting partner configuration access',()=>{
 const after=recordExpense(state,{date:'2026-11-03',category:'إيجار',title:'Rent',amount:20,paidFrom:'من جيب الشريك',partnerName:state.partners[0].name},state.partners[0].id);
 const access={...user,permissions:{view:true,expenses:true}};
 expect(()=>assertUserChanges(state,after,access)).not.toThrow();
 expect(()=>assertUserChanges(state,{...after,partners:after.partners.map((p,i)=>i? p:{...p,sharePercent:100})},access)).toThrow('تصريح');
});
it('keeps cashier upload accounts outside the complete store and never allows their ledger mutation',()=>{
 const cashier={...user,role:'cashier' as const,permissions:{}};
 expect(canView(cashier)).toBe(false);expect(()=>assertUserChanges(state,state,cashier)).toThrow('بيانات المحل');
});
