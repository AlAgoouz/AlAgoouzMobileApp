import {execFileSync} from 'node:child_process';
import fs from 'node:fs';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
export function extractPrices(source){
 const block=source.match(/INSERT INTO products\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*?);/i);
 if(!block||block[1].replace(/\s/g,'')!=='sku,barcode,name_ar,category_id,unit,purchase_price,sale_price,wholesale_price,min_stock')throw Error('Unknown product price source format');
 const row=/\(\s*'((?:''|[^'])*)'\s*,\s*'(?:''|[^'])*'\s*,\s*'((?:''|[^'])*)'\s*,\s*\d+\s*,\s*'((?:''|[^'])*)'\s*,\s*(\d+(?:\.\d{1,2})?)\s*,\s*(\d+(?:\.\d{1,2})?)\s*,\s*\d+(?:\.\d{1,2})?\s*,\s*\d+\s*\)/g;
 const rows=[...block[2].matchAll(row)].map(m=>{
  const name=m[2].replaceAll("''","'").normalize('NFC').trim().replace(/\s+/g,' '),weight=name.match(/-\s*(\d+)\s*جرام$/),kilo=name.match(/-\s*1\s*كيلو$/);
  return {sku:m[1],name,unitLabel:m[3],purchasePrice:Number(m[4]),salePrice:Number(m[5]),...(weight||kilo?{packageWeightGrams:weight?Number(weight[1]):1000}:{})};
 });
 if(!rows.length||block[2].replace(row,'').replace(/[\s,]/g,'')||new Set(rows.map(r=>r.name)).size!==rows.length)throw Error('Ambiguous product price source');
 return {productBlockSha256:crypto.createHash('sha256').update(block[0]).digest('hex'),rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const repository='AlAgoouz/Erp-AlAgoouz',commit='53102139a375b3354dafdc7293c68a815b083209',path='backend/migrations/002_seed.sql';
 const raw=JSON.parse(execFileSync('gh',['api',`repos/${repository}/contents/${path}?ref=${commit}`],{encoding:'utf8',windowsHide:true}));
 const result={sourceRepository:repository,sourceCommit:commit,sourcePath:path,sourceKind:'github_seed',requiresReview:true,...extractPrices(Buffer.from(raw.content,'base64').toString('utf8'))};
 const names=JSON.parse(fs.readFileSync('data/imports/erp-alagoouz-catalog-names.json','utf8')).names;
 if(result.rows.length!==12||result.rows.some(r=>!names.includes(r.name)))throw Error('Unexpected price coverage');
 fs.writeFileSync('data/imports/erp-alagoouz-catalog-prices.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({matched:result.rows.length,withoutPrice:names.length-result.rows.length}));
}
