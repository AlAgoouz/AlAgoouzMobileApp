// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {PeriodSelector} from '../src/components/PeriodSelector';
import {ComparisonChart,TrendChart} from '../src/components/FinancialCharts';
afterEach(cleanup);
it('retains the applied range until valid custom dates are explicitly applied',()=>{
 const change=vi.fn();render(<PeriodSelector value={{kind:'custom',from:'2026-11-01',to:'2026-11-03'}} onChange={change}/>);
 fireEvent.change(screen.getByLabelText('بداية الفترة'),{target:{value:'2026-11-04'}});
 expect(screen.getByRole('alert')).toBeTruthy();expect((screen.getByRole('button',{name:'تطبيق'}) as HTMLButtonElement).disabled).toBe(true);expect(change).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('بداية الفترة'),{target:{value:'2026-11-02'}});fireEvent.click(screen.getByRole('button',{name:'تطبيق'}));
 expect(change).toHaveBeenCalledExactlyOnceWith({kind:'custom',from:'2026-11-02',to:'2026-11-03'});
});
it('renders no positive column for zero and gives a loss a genuine negative bar',()=>{
 const {container}=render(<ComparisonChart values={[{label:'صفر',value:0,tone:'fill-gold'},{label:'خسارة',value:-20,tone:'fill-green'},{label:'مبيعات',value:10,tone:'fill-gold'}]}/>);
 expect(container.querySelectorAll('.comparison-fill')).toHaveLength(2);
 const negative=container.querySelector('.fill-negative') as HTMLElement;expect(negative.style.left).toBe('0%');expect(parseFloat(negative.style.width)).toBeCloseTo(66.666,2);
});
it('breaks the trend at missing records and provides touch/keyboard-readable details',()=>{
 const {container}=render(<TrendChart points={[{date:'2026-11-01',sales:0,profit:0,recorded:true},{date:'2026-11-02',sales:0,profit:0,recorded:false},{date:'2026-11-03',sales:10,profit:-5,recorded:true}]}/>);
 expect(container.querySelector('.trend-sales')?.getAttribute('d')?.match(/M/g)).toHaveLength(2);
 expect(container.querySelectorAll('.point-negative')).toHaveLength(1);
 fireEvent.change(screen.getByLabelText('تفاصيل تاريخ الرسم'),{target:{value:'2026-11-02'}});
 expect(screen.getByText(/لا يوجد قيد مسجل لهذا التاريخ/)).toBeTruthy();
});
it('conceals profit values and their plotted points when privacy is enabled',()=>{
 const {container}=render(<TrendChart hide points={[{date:'2026-11-01',sales:10,profit:-5,recorded:true}]}/>);
 expect(container.querySelector('.trend-profit')).toBeNull();expect(container.querySelector('.point-negative')).toBeNull();expect(screen.queryByTitle(/الصافي/)).toBeNull();
});
