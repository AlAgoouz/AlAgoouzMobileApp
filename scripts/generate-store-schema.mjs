import fs from 'node:fs';
import {z} from 'zod';
import {loadTs} from './lib/load-ts.mjs';
const {schema,cloudFields}=loadTs('src/lib/storeState.ts');
export function cloudSchema() {
  const json=z.toJSONSchema(schema,{target:'draft-7'});
  json.properties=Object.fromEntries(Object.entries(json.properties).map(([key,value])=>[cloudFields[key],value]));
  json.required=json.required.map((key)=>cloudFields[key]);
  return json;
}
const text=JSON.stringify(cloudSchema(),null,2)+'\n';
if(process.argv.includes('--check')) {
  if(fs.readFileSync('supabase/store.schema.json','utf8').replace(/\r\n/g,'\n')!==text) throw new Error('Server schema is stale; run npm run schema:generate and create a migration.');
} else {
  fs.writeFileSync('supabase/store.schema.json',text);
  if(process.argv.includes('--embed')) {
    const file='supabase/migrations/20261101204556_server_store_validation.sql';
    const migration=fs.readFileSync(file,'utf8');
    fs.writeFileSync(file,migration.replace(/-- BEGIN GENERATED SCHEMA[\s\S]*?-- END GENERATED SCHEMA/,`-- BEGIN GENERATED SCHEMA\n  v_schema jsonb := $schema$${text.trim()}$schema$::jsonb;\n-- END GENERATED SCHEMA`));
  }
}
