// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {CashierRowReview} from '../src/components/CashierRowReview';
import {INITIAL_ITEMS} from '../src/data/initialData';
afterEach(cleanup);
it('keeps a ten-thousand-item catalog bounded and requires explicit confirmation of suggested matches',()=>{
 const items=Array.from({length:10000},(_,i)=>({...INITIAL_ITEMS[0],id:'item-'+i,code:'B'+i,name:'Catalog '+i})),onChange=vi.fn();
 render(<CashierRowReview index={0} items={items} suggestions={[{itemId:'item-9999',code:'B9999',name:'Catalog 9999',score:91}]} busy={false} onChange={onChange}/>);
 expect(onChange).not.toHaveBeenCalled();expect(screen.getByLabelText('مطابقة الصف 1').querySelectorAll('option').length).toBeLessThanOrEqual(32);
 expect(screen.getByLabelText('مطابقة الصف 1').getAttribute('value')).toBeNull();
 fireEvent.change(screen.getByLabelText('بحث لصنف الصف 1'),{target:{value:'B9999'}});
 fireEvent.change(screen.getByLabelText('مطابقة الصف 1'),{target:{value:'item-9999'}});
 expect(onChange).toHaveBeenLastCalledWith({itemId:'item-9999',unit:''});
});
