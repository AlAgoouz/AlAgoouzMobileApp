import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {fixture} from './fixture.mjs';
import {projectRead} from './read-fixture.mjs';
const root=path.resolve(process.argv[2]||'dist');
const row=fixture(Number(process.env.AGOUZ_PERF_INVOICES||10000));
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'owner@example.test',created_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}};
const metrics={fullReads:0,versionReads:0,fullWireBytes:0,versionWireBytes:0};
const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1:5284');
  function send(value,kind){const raw=Buffer.from(JSON.stringify(value)),zip=gzipSync(raw);if(kind){metrics[kind+'Reads']++;metrics[kind+'WireBytes']+=zip.length;}res.writeHead(200,{'Content-Type':'application/json','Content-Encoding':'gzip','Cache-Control':'no-store'});res.end(zip);}
  if(u.pathname==='/__perf__/metrics')return send(metrics);
  if(u.pathname==='/__perf__/reset'){for(const key in metrics)metrics[key]=0;return send({ok:true});}
  if(u.pathname==='/auth/v1/user')return send(user);
  const readName=u.pathname.split('/').at(-1);
  if(['bon_erp_dashboard','bon_erp_dashboard_v2','bon_erp_sales_page','bon_erp_sale_detail','bon_erp_item_search'].includes(readName)){
    let body='';for await(const chunk of req)body+=chunk;
    return send(projectRead(row,readName,JSON.parse(body||'{}')));
  }
  if(u.pathname==='/rest/v1/rpc/bon_erp_my_access')return send({user_id:user.id,partner_id:'p1',username:'owner',display_name:'مالك الاختبار',role:'partner',is_owner:true,permissions:{view:true}});
  if(u.pathname==='/rest/v1/rpc/bon_erp_operational_health')return send({checkedAt:new Date().toISOString(),imports:{failed:0,working:0,delayed:0,awaitingReview:0},backup:null});
  if(u.pathname==='/rest/v1/rpc/bon_erp_read_import')return send([]);
  if(u.pathname==='/rest/v1/rpc/bon_erp_list_users')return send([{user_id:user.id,partner_id:'p1',username:'owner',display_name:'مالك الاختبار',role:'partner',is_owner:true,permissions:{view:true},email:user.email,disabled:false,deleted:false,created_at:user.created_at}]);
  if(u.pathname==='/rest/v1/erp_members')return send({partner_id:'p1',role:'partner'});
  if(u.pathname==='/rest/v1/bon_elagouz_store')return send(u.searchParams.get('select')==='version'?{version:0}:row,u.searchParams.get('select')==='version'?'version':'full');
  if(u.pathname==='/rest/v1/cashier_sync_queue'){if(req.method==='HEAD'){res.writeHead(200,{'Content-Range':'*/0','Cache-Control':'no-store'});return res.end();}return send([]);}
  if(u.pathname.startsWith('/rest/')||u.pathname.startsWith('/auth/')){res.writeHead(403);return res.end('Fixture is read-only');}
  const file=path.resolve(root,'.'+(['/', '/menu', '/menu/'].includes(u.pathname)?'/index.html':u.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
  const bytes=gzipSync(fs.readFileSync(file));res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Encoding':'gzip','Cache-Control':'no-store'});res.end(bytes);
});
server.on('upgrade',(_req,socket)=>socket.destroy());
server.listen(5284,'127.0.0.1',()=>console.log('Synthetic performance fixture ready on loopback:5284'));
