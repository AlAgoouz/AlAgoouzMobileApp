import React from 'react';
import type {LegacyCatalogPrices} from '../types/erp';
import {legacyPriceUnit} from '../lib/legacyCatalogPrices';
import {money} from '../lib/reporting';
export function LegacyCatalogPricesNote({prices}:{prices:LegacyCatalogPrices}){
 return <aside className="rounded-xl border border-[#dfd0b8] bg-[#fffaf0] p-3 my-3 text-xs" aria-label="أسعار مستوردة تحتاج مراجعة"><dl className="grid grid-cols-2 gap-3"><div><dt>سعر الشراء المستورد</dt><dd className="font-bold">{money(prices.purchasePrice)} ج.م</dd></div><div><dt>سعر البيع المستورد</dt><dd className="font-bold">{money(prices.salePrice)} ج.م</dd></div></dl><p>السعر لكل {legacyPriceUnit(prices)}.</p><p className="operation-note">مرجع ({prices.sourceName}) من ملف التهيئة بالمشروع القديم؛ راجع الأسعار قبل اعتماد المنتج.</p></aside>;
}
