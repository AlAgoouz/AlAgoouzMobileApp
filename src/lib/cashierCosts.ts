import type {CashierDay,PurchaseInvoice} from '../types/erp';
import {sumMoney,sumMoneyProducts} from './money';

type Allocation={
  purchaseId:string;
  invoiceNumber:string;
  purchaseDate:string;
  quantity:number;
  unitCost:number;
};
type DayLine=NonNullable<CashierDay['consumption']>[number];
export type CashierCostDetail={line:DayLine;covered:number;uncovered:number;totalCost:number;allocations:Allocation[]};
type OpenShortage={dayId:string;remaining:number;eligibleAfter:string};
const weight=(value:number)=>Number(value.toFixed(6));
const documentId=(event:{kind:'day';day:CashierDay}|{kind:'purchase';purchase:PurchaseInvoice})=>
  event.kind==='day'?event.day.id:event.purchase.id;

export function cashierCostDetails(days:readonly CashierDay[],purchases:readonly PurchaseInvoice[]){
  const events:Array<
    {time:string;kind:'day';day:CashierDay}|
    {time:string;kind:'purchase';purchase:PurchaseInvoice}
  >=[];
  for(const day of days)if(day.status==='approved'&&day.approvedAt&&day.consumption)
    events.push({time:new Date(day.approvedAt).toJSON()??'',kind:'day',day});
  const tracked=new Set(days.filter(day=>day.status==='approved').flatMap(day=>(day.shortages??[]).map(line=>line.itemId)));
  if(!tracked.size)return new Map<string,CashierCostDetail[]>();
  for(const purchase of purchases)if(!purchase.isCancelled&&purchase.createdAt&&purchase.inventoryBefore?.length)
    events.push({time:new Date(purchase.createdAt).toJSON()??'',kind:'purchase',purchase});
  events.sort((a,b)=>a.time.localeCompare(b.time)||
    (a.kind===b.kind?0:a.kind==='purchase'?-1:1)||
    (documentId(a)<documentId(b)?-1:documentId(a)>documentId(b)?1:0));
  const open=new Map<string,OpenShortage[]>();
  const details=new Map<string,Map<string,CashierCostDetail>>();
  const reconcile=(itemId:string,stockDebt:number)=>{
    const queue=open.get(itemId)??[];
    let settled=weight(queue.reduce((total,row)=>total+row.remaining,0)-stockDebt);
    for(const row of queue){
      if(settled<=0)break;
      const used=Math.min(settled,row.remaining);
      row.remaining=weight(row.remaining-used);
      settled=weight(settled-used);
    }
    const active=queue.filter(row=>row.remaining>0);
    open.set(itemId,active);
    return active;
  };
  for(const event of events){
    if(!event.time)continue;
    if(event.kind==='day'){
      const {day}=event;
      const shortages=new Map(day.shortages?.map(line=>[line.itemId,line.shortage]));
      for(const line of day.consumption??[]){
        if(!tracked.has(line.itemId))continue;
        const debt=shortages.get(line.itemId)??0;
        const quantity=weight(Math.min(debt,line.quantity));
        const queue=reconcile(line.itemId,weight(debt-quantity));
        if(quantity<=0)continue;
        const lines=details.get(day.id)??new Map<string,CashierCostDetail>();
        lines.set(line.itemId,{line,covered:0,uncovered:quantity,totalCost:line.totalCost,allocations:[]});
        details.set(day.id,lines);
        queue.push({dayId:day.id,remaining:quantity,eligibleAfter:day.date});
      }
      continue;
    }
    const {purchase}=event;
    const beforeById=new Map(purchase.inventoryBefore!.map(item=>[item.id,item.stock]));
    for(const line of purchase.items){
      const before=beforeById.get(line.itemId);
      if(before===undefined||!open.get(line.itemId)?.length)continue;
      const debt=weight(Math.max(0,-before));
      const queue=reconcile(line.itemId,debt);
      // Leave the oldest, unidentifiable portion of any stock deficit at its original valuation.
      let available=weight(Math.min(line.quantity,debt)-Math.max(0,debt-queue.reduce((total,row)=>total+row.remaining,0)));
      for(const row of queue){
        if(available<=0)break;
        const quantity=weight(Math.min(available,row.remaining));
        row.remaining=weight(row.remaining-quantity);
        available=weight(available-quantity);
        if(purchase.date<row.eligibleAfter)continue;
        const detail=details.get(row.dayId)!.get(line.itemId)!;
        detail.allocations.push({purchaseId:purchase.id,invoiceNumber:purchase.invoiceNumber,purchaseDate:purchase.date,
          quantity,unitCost:line.purchasePrice});
        detail.covered=weight(detail.covered+quantity);
        detail.uncovered=weight(detail.uncovered-quantity);
      }
      open.set(line.itemId,queue.filter(row=>row.remaining>0));
    }
  }
  return new Map([...details].map(([dayId,lines])=>[dayId,[...lines.values()].map(detail=>{
    const {line,covered,allocations}=detail;
    return {...detail,totalCost:allocations.length?sumMoneyProducts([
      [weight(line.quantity-covered),line.unitCost],
      ...allocations.map(entry=>[entry.quantity,entry.unitCost] as const),
    ]):line.totalCost};
  })]));
}

export function correctedCashierCost(day:CashierDay,details:readonly CashierCostDetail[]=[]){
  if(day.totalCost===undefined)return undefined;
  return sumMoney([day.totalCost,...details.flatMap(detail=>[detail.totalCost,-detail.line.totalCost])]);
}
