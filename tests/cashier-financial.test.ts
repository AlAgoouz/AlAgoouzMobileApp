import {it,expect} from 'vitest';
import {begunRevenue} from '../src/lib/cashierFinancial';
it('uses only one confirmed Begun amount for the same date and preserves zero',()=>{
 expect(begunRevenue([{metric:'Begun',amount:'6737.60',businessDate:'2026-11-01'}],'2026-11-01')).toBe(6737.6);
 expect(begunRevenue([{metric:'Begun',amount:'0.00',businessDate:'2026-11-01'}],'2026-11-01')).toBe(0);
 for(const rows of [[{metric:'Begun',amount:'1.00'}],[{total:6737.6}],[{metric:'Total Revenue',amount:'6737.60'}],[{metric:'Begun',amount:'6737.60',businessDate:'2026-11-02'}],[{metric:'Begun',amount:'-1.00'}],[{metric:'Begun',amount:'unknown'}],[{metric:'Begun',amount:'1.00'},{metric:'Begun',amount:'1.00'}]])expect(begunRevenue(rows,'2026-11-01')).toBeUndefined();
});
