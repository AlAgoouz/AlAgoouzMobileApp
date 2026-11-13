import {parseLocalizedNumber} from './cashierRows';
export function begunRevenue(rows:Record<string,unknown>[],date:string):number|undefined{
 if(rows.length!==1||rows[0].metric!=='Begun')return undefined;
 const row=rows[0];
 if(row.businessDate!==date)return undefined;
 if(typeof row.amount!=='string'||!/^\d+\.\d{2}$/.test(row.amount))return undefined;
 const amount=parseLocalizedNumber(row.amount);
 return amount!==undefined&&amount>=0?amount:undefined;
}
