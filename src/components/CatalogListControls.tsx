import React from 'react';
import {Search} from 'lucide-react';
import {RecordPagination} from './RecordPagination';
import type {CatalogSort} from '../lib/catalogBrowse';
import '../catalog-register.css';
export function CatalogListControls({label,search,onSearch,sort,onSort,pageSize,onPageSize}:{label:string;search:string;onSearch:(value:string)=>void;sort:CatalogSort;onSort:(value:CatalogSort)=>void;pageSize:number;onPageSize:(value:number)=>void}){
 return <div className="catalog-list-controls"><label className="catalog-search-label">{label}<span><Search size={17} aria-hidden="true"/><input value={search} onChange={e=>onSearch(e.target.value)} placeholder="اكتب الاسم أو الكود…" type="search"/></span></label><label>الترتيب<select value={sort} onChange={e=>onSort(e.target.value as CatalogSort)}><option value="name">الاسم من أ إلى ي</option><option value="original">ترتيب الإضافة</option></select></label><label>عدد النتائج في الصفحة<select value={pageSize} onChange={e=>onPageSize(Number(e.target.value))}><option value={25}>25 منتجًا</option><option value={50}>50 منتجًا</option><option value={100}>100 منتج</option></select></label></div>;
}
export function CatalogListNavigation({page,label}:{page:{page:number;pages:number;total:number;pageSize:number;setPage:(value:number)=>void};label:string}){
 if(!page.total)return null;
 return <div className="catalog-list-navigation"><RecordPagination {...page}/>{page.pages>1&&<label>الصفحة<select aria-label={label} value={page.page} onChange={e=>page.setPage(Number(e.target.value))}>{Array.from({length:page.pages},(_,i)=><option key={i} value={i}>{i+1} من {page.pages}</option>)}</select></label>}</div>;
}
