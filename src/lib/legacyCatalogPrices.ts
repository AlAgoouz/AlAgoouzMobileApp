import type {LegacyCatalogPrices,InventoryItem} from '../types/erp';
export function legacyPriceUnit(prices:LegacyCatalogPrices){return prices.unitLabel+(prices.packageWeightGrams?` (${prices.packageWeightGrams} جرام)`:'');}
export function legacyPricesForUnit(prices:LegacyCatalogPrices,unit:InventoryItem['baseUnit']|''){
 const multiplier=unit==='piece'?1:unit==='kg'&&prices.packageWeightGrams?1000/prices.packageWeightGrams:null;
 if(multiplier===null)return null;
 const convert=(value:number)=>{const cents=Math.round(value*multiplier*100);return Number.isSafeInteger(cents)&&cents>=0&&cents<=99999999999999?cents/100:null;};
 const purchasePrice=convert(prices.purchasePrice),salePrice=convert(prices.salePrice);
 return purchasePrice===null||salePrice===null?null:{purchasePrice,salePrice};
}
