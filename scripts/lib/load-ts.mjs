import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const cache=new Map();
export function loadTs(file) {
  file=path.resolve(file);
  if(cache.has(file)) return cache.get(file);
  const exports={};cache.set(file,exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports, require:(name)=>name.startsWith('.')?loadTs(path.resolve(path.dirname(file),name+'.ts')):require(name),
    console,Date,Map,Set,crypto,
  },{filename:file});
  return exports;
}
