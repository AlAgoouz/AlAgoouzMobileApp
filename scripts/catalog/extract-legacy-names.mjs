import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';
import {pathToFileURL} from 'node:url';

export function extractNames(source){
 const file=ts.createSourceFile('source.ts',source,ts.ScriptTarget.Latest,true);
 let found;
 function visit(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(file)==='EXACT_PRODUCT_IMAGES'){
   if(found||!node.initializer||!ts.isObjectLiteralExpression(node.initializer))throw Error('Unexpected source format');
   found=node.initializer.properties.map(p=>{
    if(!ts.isPropertyAssignment(p)||!p.name||!(ts.isIdentifier(p.name)||ts.isStringLiteral(p.name))||!ts.isStringLiteral(p.initializer))throw Error('Unexpected catalog entry');
    return p.name.text;
   });
  }
  ts.forEachChild(node,visit);
 }
 visit(file);if(!found?.length)throw Error('No explicit catalog names found');
 const names=[...new Set(found.map(n=>n.normalize('NFC').trim().replace(/\s+/g,' ')))];
 if(names.some(n=>!n||n.length>200))throw Error('Invalid catalog name');
 return {rawCount:found.length,duplicateCount:found.length-names.length,names};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const repository='AlAgoouz/Erp-AlAgoouz',commit='53102139a375b3354dafdc7293c68a815b083209',path='backend/src/scripts/preciseProductImageCurator.ts';
 const response=JSON.parse(execFileSync('gh',['api',`repos/${repository}/contents/${path}?ref=${commit}`],{encoding:'utf8',windowsHide:true}));
 const source=Buffer.from(response.content,'base64').toString('utf8');
 const result={sourceRepository:repository,sourceCommit:commit,sourcePath:path,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),...extractNames(source)};
 fs.mkdirSync('data/imports',{recursive:true});fs.writeFileSync('data/imports/erp-alagoouz-catalog-names.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({names:result.names.length,duplicates:result.duplicateCount,sourceCommit:commit}));
}
