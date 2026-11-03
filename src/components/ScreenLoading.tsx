import React from 'react';
export function ScreenLoading({label='جارٍ تحميل الشاشة…'}:{label?:string}){return <div className="screen-loading" role="status"><span>{label}</span><div className="loading-grid" aria-hidden="true"><div className="loading-shape"/><div className="loading-shape"/><div className="loading-shape"/></div></div>;}
