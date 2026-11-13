import React,{useMemo,useState} from 'react';
export function useRecordPage<T>(records:readonly T[],resetKey:unknown,pageSize=50,controlled?:{page:number;setPage:(page:number)=>void}){
  const [position,setPosition]=useState({key:resetKey,page:0});
  const pages=Math.max(1,Math.ceil(records.length/pageSize));
  const requestedPage=controlled?.page??(position.key===resetKey?position.page:0);
  const page=Math.max(0,Math.min(requestedPage,pages-1));
  const visible=useMemo(()=>records.slice(page*pageSize,(page+1)*pageSize),[records,page,pageSize]);
  const setPage=(next:number)=>{
    const clampedPage=Math.max(0,Math.min(next,pages-1));
    if(controlled)controlled.setPage(clampedPage);
    else setPosition({key:resetKey,page:clampedPage});
  };
  return {visible,page,pages,total:records.length,pageSize,setPage};
}
export function RecordPagination({page,pages,total,pageSize,setPage}:{page:number;pages:number;total:number;pageSize:number;setPage:(page:number)=>void}){
  if(total===0)return null;
  return <nav aria-label="صفحات السجل" className="flex items-center justify-between gap-3 rounded-xl border border-[#E6DEC8] bg-white p-3 text-xs">
    <button type="button" disabled={page===0} onClick={()=>setPage(page-1)} className="rounded-lg border p-2 disabled:opacity-40">الصفحة السابقة</button>
    <span role="status">{page*pageSize+1}–{Math.min((page+1)*pageSize,total)} من {total}</span>
    <button type="button" disabled={page===pages-1} onClick={()=>setPage(page+1)} className="rounded-lg border p-2 disabled:opacity-40">الصفحة التالية</button>
  </nav>;
}
