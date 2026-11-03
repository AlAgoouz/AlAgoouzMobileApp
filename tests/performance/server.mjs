import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {fixture} from './fixture.mjs';
const root=path.resolve(process.argv[2]||'dist');
const row=fixture(Number(process.env.AGOUZ_PERF_INVOICES||10000));
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'owner@example.test',created_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}};
const metrics={fullReads:0,versionReads:0,fullWireBytes:0,versionWireBytes:0};
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1:5284');
  function send(value,kind){const raw=Buffer.from(JSON.stringify(value)),zip=gzipSync(raw);if(kind){metrics[kind+'Reads']++;metrics[kind+'WireBytes']+=zip.length;}res.writeHead(200,{'Content-Type':'application/json','Content-Encoding':'gzip','Cache-Control':'no-store'});res.end(zip);}
  if(u.pathname==='/__perf__/metrics')return send(metrics);
  if(u.pathname==='/__perf__/reset'){for(const key in metrics)metrics[key]=0;return send({ok:true});}
  if(u.pathname==='/auth/v1/user')return send(user);
  if(u.pathname==='/rest/v1/rpc/bon_erp_my_access')return send({user_id:user.id,partner_id:'p1',username:'owner',display_name:'مالك الاختبار',role:'partner',is_owner:true,permissions:{view:true}});
  if(u.pathname==='/rest/v1/rpc/bon_erp_list_users')return send([{user_id:user.id,partner_id:'p1',username:'owner',display_name:'مالك الاختبار',role:'partner',is_owner:true,permissions:{view:true},email:user.email,disabled:false,deleted:false,created_at:user.created_at}]);
  if(u.pathname==='/rest/v1/erp_members')return send({partner_id:'p1',role:'partner'});
  if(u.pathname==='/rest/v1/bon_elagouz_store')return send(u.searchParams.get('select')==='version'?{version:0}:row,u.searchParams.get('select')==='version'?'version':'full');
  if(u.pathname==='/rest/v1/cashier_sync_queue')return send([]);
  if(u.pathname.startsWith('/rest/')||u.pathname.startsWith('/auth/')){res.writeHead(403);return res.end('Fixture is read-only');}
  const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
  const bytes=gzipSync(fs.readFileSync(file));res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Encoding':'gzip','Cache-Control':'no-store'});res.end(bytes);
});
server.on('upgrade',(_req,socket)=>socket.destroy());
server.listen(5284,'127.0.0.1',()=>console.log('Synthetic performance fixture ready on loopback:5284'));
