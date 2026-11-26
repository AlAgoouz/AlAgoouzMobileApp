import {unitLabel as displayUnit} from '../lib/units';
import { TriangleAlert as HeaderTriangleAlert } from 'lucide-react';
import {OperationHeader} from './OperationHeader';
import {matchesRecordSearch} from '../lib/recordSearch';
import { isStockItem } from '../lib/itemPolicy';
import React, { useState, useMemo } from "react";
import {RecordPagination,useRecordPage} from './RecordPagination';
import { InventoryItem } from "../types/erp";

export const ShortagesScreen: React.FC<{
  items: InventoryItem[];
  onOpenMovement?: (id:string)=>void;
  onNavigateToPurchase: () => void;
  onNavigateToProduction: () => void;
  onBack: () => void;
}> = ({ items, onOpenMovement, onNavigateToPurchase, onNavigateToProduction, onBack }) => {
  const [query,setQuery]=useState('');
  const lowItems = useMemo(()=>items.filter(i=>isStockItem(i)&&i.stock<=i.minStock),[items]);
  const matches=useMemo(()=>lowItems.filter(item=>matchesRecordSearch(query,item.name,item.code)),[lowItems,query]);
  const shortagePage=useRecordPage(matches,query,20);

  return (
    <div className="operation-screen min-h-screen pb-24">
      <OperationHeader title={<>النواقص ( {lowItems.length} )</>} description={<>الأصناف التي تحتاج توريدًا أو مراجعة رصيدها.</>} icon={HeaderTriangleAlert} onBack={onBack}></OperationHeader>

      <div className="record-workspace">
        <label className="record-search">البحث في النواقص
          <input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="اسم الصنف أو الكود" />
        </label>
        {shortagePage.total>shortagePage.pageSize&&<RecordPagination {...shortagePage}/>}
        {shortagePage.total === 0 ? (
          <p className="record-state">
            {lowItems.length?'لا توجد نواقص مطابقة.':'لا توجد نواقص حاليًا.'}
          </p>
        ) : (
          <div className="record-grid">
            {shortagePage.visible.map((item) => {
              const cheapest =
                item.supplierPrices.length > 0
                  ? item.supplierPrices.reduce(
                      (min, p) => (p.price < min.price ? p : min),
                      item.supplierPrices[0],
                    )
                  : null;

              return (
                <article
                  key={item.id}
                  className="record-card flex flex-col justify-between gap-3 border-gold-edge"
                >
                  <div className="record-heading mb-0">
                    <div>
                      <h2 className="text-sm font-extrabold text-ink-strong">
                        {item.name}
                      </h2>
                      <p className="mt-1">
                        حد الطلب: <b>{item.minStock}</b>
                        {cheapest &&
                          ` • أرخص مورد: ${cheapest.supplierName} (${cheapest.price} ج.م)`}
                      </p>
                    </div>
                    <span className="record-badge bg-status-danger-bg text-status-danger border-status-danger-line font-black">
                      المتبقي: {item.stock}{" "}
                      {displayUnit(item.baseUnit)}
                    </span>
                  </div>
                  <div className="record-actions">
                    {onOpenMovement&&<button type="button" className="record-action" onClick={()=>onOpenMovement(item.id)}>فتح حركة الصنف</button>}
                    <button
                      type="button"
                      onClick={
                        item.category === "manufactured_blend"
                          ? onNavigateToProduction
                          : onNavigateToPurchase
                      }
                      className="operation-primary"
                    >
                      {item.category === "manufactured_blend"
                        ? "تصنيع في الإنتاج"
                        : "شراء من المورد"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
