export type CatalogSort='name'|'original';
export function catalogSearchText(value:string){
 return value.normalize('NFKD').toLocaleLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[٠-٩]/g,n=>String(n.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,n=>String(n.charCodeAt(0)-0x6f0)).trim();
}
const order=new Intl.Collator('ar',{numeric:true,sensitivity:'base'});
export function browseCatalog<T extends {name:string;code?:string}>(rows:readonly T[],query:string,sort:CatalogSort){
 const words=catalogSearchText(query).split(/\s+/).filter(Boolean);
 const result=rows.filter(row=>{const haystack=catalogSearchText(row.name+' '+(row.code??''));return words.every(word=>haystack.includes(word));});
 return sort==='name'?result.sort((a,b)=>order.compare(a.name,b.name)):result;
}
