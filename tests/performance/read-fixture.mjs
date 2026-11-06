// Synthetic read-only projection used by the disposable browser runner.
import {loadTs} from '../../scripts/lib/load-ts.mjs';
const {salesForReports}=loadTs('src/lib/cashierDays.ts');
const {financialPosition}=loadTs('src/lib/financialOpening.ts');
const {emptyStore,cloudFields}=loadTs('src/lib/storeState.ts');
const {businessDate}=loadTs('src/lib/dates.ts');
export function projectRead(row,name,args){
 const days=row.cashier_days??[],items=row.items,all=row.sales_invoices;
 if(name==='bon_erp_item_search')return items.filter(i=>[i.name,i.code].some(v=>v.toLowerCase().includes(args.p_query.toLowerCase()))).slice(0,args.p_limit).map(({id,name,code,stock,baseUnit})=>({id,name,code,stock,baseUnit}));
 if(name==='bon_erp_sale_detail')return (args.p_kind==='cashier'?days:all).find(i=>i.id===args.p_id)??null;
 if(name==='bon_erp_sales_page'){
  const kind=args.p_kind??(days.length?'cashier':all.some(i=>i.saleType!=='wholesale')?'legacy':'wholesale');
  const query=args.p_query?.toLowerCase()??'';
  const records=(kind==='cashier'?days:all.filter(i=>kind==='wholesale'?i.saleType==='wholesale':i.saleType!=='wholesale')).filter(i=>[i.invoiceNumber??'',i.customerName??'',i.date,...(i.items??[]).map(l=>l.itemName)].some(v=>v.toLowerCase().includes(query))).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
  return {kind,version:row.version,total:records.length,rows:records.slice(args.p_offset,args.p_offset+args.p_limit).map(({items,itemsReport,consumption,...value})=>({...value,itemsCount:items?.length??itemsReport?.lines.length??0}))};
 }
 if(name==='bon_erp_dashboard'||name==='bon_erp_dashboard_v2'){
  const active=salesForReports({salesInvoices:all,cashierDays:days}).filter(i=>i.date>=args.p_from&&i.date<=args.p_to&&!i.isReturned),expenses=row.expenses.filter(e=>e.date>=args.p_from&&e.date<=args.p_to&&!e.isCancelled&&e.category!=='مسحوبات شركاء');
  const pendingCostDays=active.filter(i=>i.totalCost===null).length;
  const sum=(records,field)=>records.reduce((s,i)=>s+i[field],0),revenue=sum(active,'totalAmount'),cost=pendingCostDays?null:sum(active,'totalCost'),gross=pendingCostDays?null:sum(active,'netProfit'),spent=sum(expenses,'amount');
  const entries=new Map(),products=new Map();
  for(const invoice of active){const day=entries.get(invoice.date)??{date:invoice.date,sales:0,profit:0};day.sales+=invoice.totalAmount;day.profit=day.profit===null||invoice.netProfit===null?null:day.profit+invoice.netProfit;entries.set(invoice.date,day);for(const line of invoice.items){const product=products.get(line.itemId)??{id:line.itemId,name:line.itemName,revenue:0};product.revenue+=line.totalPrice;products.set(line.itemId,product);}}
  for(const expense of expenses){const day=entries.get(expense.date)??{date:expense.date,sales:0,profit:0};day.profit=day.profit===null?null:day.profit-expense.amount;entries.set(expense.date,day);}
  const dates=[...entries.keys()].sort(),stock=items.filter(i=>!['drink_recipe','seasoning_recipe'].includes(i.category)),shortages=stock.filter(i=>i.stock<=i.minStock).length;
  const state=Object.fromEntries(Object.entries(cloudFields).map(([key,cloud])=>[key,row[cloud]??emptyStore[key]]));
  return {version:row.version,report:{revenue,cost,gross,spent,net:gross===null?null:gross-spent,margin:gross===null?null:revenue?(gross-spent)/revenue*100:0,count:active.length,pendingCostDays,entries:[...entries.values()],firstDate:dates[0]??null,lastDate:dates.at(-1)??null},cash:financialPosition(state,args.p_from,args.p_to<businessDate()?args.p_to:businessDate()),balances:{inventory:stock.reduce((s,i)=>s+i.stock*i.costPrice,0),debts:sum(row.customers,'balance'),shortages},pending:days.filter(d=>d.status==='pending').length,approved:active.filter(i=>i.saleType==='cashier_sync'&&i.totalCost!==null).length,queued:0,channels:[['wholesale','الجملة'],['cashier_sync','يوم الكاشير'],['retail','بيع المحل السابق']].map(([id,label])=>({id,label,value:sum(active.filter(i=>i.saleType===id),'totalAmount')})),products:[...products.values()].sort((a,b)=>b.revenue-a.revenue||a.id.localeCompare(b.id)).slice(0,5),activity:row.audit_logs.slice(0,4),counts:{products:items.length,inventory:items.length,purchase:row.purchase_invoices.length,cashier_sync:days.filter(d=>d.status==='pending').length,sales_invoices:all.length+days.filter(d=>d.financialReport).length,customers:row.customers.length,suppliers:row.suppliers.length,staff_payroll:row.employees.length,shortages}};
 }
 throw Error('Unsupported synthetic read');
}
