// Remote, disposable CI browser only; never controls a browser on the user's computer.
import {chromium} from 'playwright';
import fs from 'node:fs';
if(process.env.CI!=='true')throw new Error('PERFORMANCE_BROWSER_REQUIRES_ISOLATED_CI');
const label=process.argv[2]||'current',samples=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let failed=false;
for(let run=0;run<3;run++){
 const server=await chromium.launchServer({headless:true});
 const browser=await chromium.connect(server.wsEndpoint());
 const context=await browser.newContext({viewport:{width:360,height:740},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const sample={homeReadyMs:null,invoiceReadyMs:null,nodes:null,renderedInvoices:null,lcpMs:null,refreshWireBytes:null,phase:'starting',timedOut:false};
 const phase=value=>{sample.phase=value;console.log(label,run+1,value);};
 let timer;
 const task=(async()=>{
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await context.addInitScript(()=>{
    const encode=x=>btoa(JSON.stringify(x)).replaceAll('=','').replaceAll('+','-').replaceAll('/','_');
    const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'owner@example.test',created_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}};
    localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,role:'authenticated',aud:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})+'.fixture',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user}));
    window.__perfLCP=0;new PerformanceObserver(list=>{for(const entry of list.getEntries())window.__perfLCP=entry.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
  });
  const page=await context.newPage(),cdp=await context.newCDPSession(page);
  page.on('pageerror',error=>console.log('Synthetic page error:',error.message.slice(0,300)));
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:400,downloadThroughput:400000/8,uploadThroughput:200000/8,connectionType:'cellular3g'});
  page.setDefaultTimeout(30000);
  await fetch('http://127.0.0.1:5284/__perf__/reset');
  phase('loading-home');const start=performance.now();await page.goto('http://127.0.0.1:5284/',{waitUntil:'domcontentloaded'});
  try{await page.getByText('ملخص الإحصائيات والأرباح المباشر',{exact:true}).waitFor();}
  catch(error){console.log('Synthetic initial screen:',(await page.locator('body').innerText({timeout:2000})).slice(0,600));throw error;}
  sample.homeReadyMs=performance.now()-start;console.log(label,'homeReadyMs',sample.homeReadyMs);
  if(run===0)await page.screenshot({path:label+'-mobile.png'});
  phase('opening-invoices');await page.getByRole('button',{name:'الأقسام',exact:true}).last().click();
  const invoiceStart=performance.now();await page.getByRole('button',{name:/فواتير البيع/}).click();
  await page.getByRole('heading',{name:/الفواتير والمرتجعات|سجل المبيعات/}).waitFor();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  sample.invoiceReadyMs=performance.now()-invoiceStart;
  phase('counting-invoices');sample.nodes=await page.locator('*').count();sample.renderedInvoices=await page.getByRole('button',{name:'طباعة / واتساب',exact:true}).count();
  console.log(label,'invoiceReadyMs',sample.invoiceReadyMs,'rendered',sample.renderedInvoices);
  if(label!=='baseline'&&(await(await fetch('http://127.0.0.1:5284/__perf__/metrics')).json()).fullReads!==0)throw Error('INITIAL_FULL_STORE_READ_FORBIDDEN');
  phase('checking-refresh-traffic');const initial=await(await fetch('http://127.0.0.1:5284/__perf__/metrics')).json();
  for(let i=0;i<3;i++){const response=page.waitForResponse(r=>r.url().includes('/rest/v1/bon_elagouz_store'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await(await response).finished();await sleep(500);}
  const end=await(await fetch('http://127.0.0.1:5284/__perf__/metrics')).json();
  sample.refreshWireBytes=end.fullWireBytes+end.versionWireBytes-initial.fullWireBytes-initial.versionWireBytes;sample.lcpMs=await page.evaluate(()=>window.__perfLCP);
  if(label!=='baseline'){
    phase('checking-full-history-search');await page.getByRole('textbox',{name:'بحث في كل الفواتير'}).fill('INV-09999');await page.getByText('#INV-09999',{exact:false}).waitFor();
    if(await page.getByRole('button',{name:'طباعة / واتساب',exact:true}).count()!==1)throw Error('INVOICE_SEARCH_MISMATCH');
    if(sample.renderedInvoices>50||sample.refreshWireBytes>1000)throw Error('PERFORMANCE_BUDGET_FAILED');
  }
  phase('complete');
 })();
 task.catch(()=>{});
 try{await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>{sample.timedOut=true;reject(Error('MEASUREMENT_90_SECOND_LIMIT'));},90000);})]);}
 catch(error){sample.error=error.message.slice(0,160);if(label!=='baseline'||sample.homeReadyMs===null)failed=true;console.log(label,'measurement stopped',sample.phase,sample.error);}
 finally{clearTimeout(timer);await Promise.race([server.kill(),sleep(5000)]);}
 samples.push(sample);
}
const median=key=>{const values=samples.map(s=>s[key]).filter(v=>typeof v==='number').sort((a,b)=>a-b);return values.length===3?values[1]:null;};
const report={label,conditions:{invoices:10000,cpuSlowdown:6,downloadKbps:400,uploadKbps:200,latencyMs:400,viewport:'360x740',sampleLimitMs:90000,physicalPhoneTest:false},samples,median:Object.fromEntries(['homeReadyMs','invoiceReadyMs','nodes','renderedInvoices','lcpMs','refreshWireBytes'].map(k=>[k,median(k)]))};
fs.writeFileSync(label+'-performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(label==='current'&&!failed)await(await import('./design-review.mjs')).verifyDesign();
if(failed)process.exitCode=1;
