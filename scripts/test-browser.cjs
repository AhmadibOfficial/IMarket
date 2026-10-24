'use strict';
// UI contract journeys only. Real authorization, persistence and races are tested
// independently by mandatory PostgreSQL CI; this fixture never claims those.
const {createServer}=require('node:http');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const assert=require('node:assert/strict');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let api,web,chrome,socket,profile;
const origin='http://127.0.0.1:3109';
async function waitFor(fn){for(let i=0;i<100;i++){try{const result=await fn();if(result)return result;}catch{}await pause(100);}throw Error('Browser condition timed out');}
async function listen(server,port){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}
async function main(){
 let lifecycle='reserved',read_at=null,unavailable=false;
 const timeline=[{id:'created',action:'order.create',created_at:'2026-10-24T12:00:00Z'}];
 const order=()=>({id:'synthetic-order',name:'Synthetic rice',description:'Fixture order',quantity:1,total_kobo:10000,lifecycle,created_at:'2026-10-24T12:00:00Z',timeline});
 api=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers','authorization,content-type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Content-Type','application/json');
  if(req.method==='OPTIONS'){res.end();return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=chunks.length?JSON.parse(Buffer.concat(chunks)):{};
  const path=req.url.split('?')[0];
  let result=[];
  if(path==='/api/auth/login')result={accessToken:`fixture-${body.alias}`};
  else if(path==='/api/orders')result=[order()];
  else if(path==='/api/orders/synthetic-order')result=order();
  else if(path==='/api/merchant/orders/synthetic-order/fulfill'){
   lifecycle=body.lifecycle;timeline.push({id:lifecycle,action:`order.${lifecycle}`,created_at:'2026-10-24T12:01:00Z'});result=order();
  }else if(path==='/api/notifications'){
   await pause(300); // Make the loading state observable in the UI journey.
   if(unavailable){res.statusCode=503;result={message:'Synthetic failure'};}else result=timeline.length>1?[{...timeline.at(-1),order_id:'synthetic-order',read_at}]:[];
  }else if(path.endsWith('/read')){read_at='2026-10-24T12:02:00Z';result={read_at};}
  else if(path==='/api/merchant/overview')result={products:0,published:0,active_orders:1,open_disputes:0};
  res.end(JSON.stringify(result));
 });
 await listen(api,4000); // Exclusive bind prevents connecting to an existing API.
 const preflight=createServer();await listen(preflight,3109);await new Promise(r=>preflight.close(r));
 web=spawn(process.execPath,['node_modules/next/dist/bin/next','start','apps/web','-H','127.0.0.1','-p','3109'],{stdio:'ignore'});
 await waitFor(async()=>{const r=await fetch(origin);return r.ok;});
 profile=mkdtempSync(join(tmpdir(),'imarket-browser-'));
 chrome=spawn(process.env.CHROMIUM_BIN||'chromium',['--headless','--disable-gpu','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','about:blank'],{stdio:['ignore','ignore','pipe']});
 let output='';chrome.stderr.on('data',b=>output+=b.toString());
 const endpoint=await waitFor(()=>output.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1]);
 const port=new URL(endpoint).port;
 const target=await (await fetch(`http://127.0.0.1:${port}/json/new?${origin}/merchant`,{method:'PUT'})).json();
 socket=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 let serial=0;const pending=new Map();
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const {resolve,reject,timer}=pending.get(m.id);clearTimeout(timer);pending.delete(m.id);m.error?reject(Error(m.error.message)):resolve(m.result);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`DevTools timeout: ${method}`));},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Browser evaluation failed');return r.result.value;};
 const text=()=>evaluate('document.body.innerText');
 const click=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Button unavailable');b.click();})()`);
 const contains=s=>waitFor(async()=>(await text()).includes(s));
 async function login(alias){
  await waitFor(()=>evaluate("(()=>{const input=document.querySelector('input[type=password]');return !!input&&Object.keys(input).some(k=>k.startsWith('__reactProps'));})()"));
  await evaluate(`(()=>{const inputs=document.querySelectorAll('form input');for(const [i,value] of [[0,${JSON.stringify(alias)}],[1,'synthetic-password']]){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inputs[i],value);inputs[i].dispatchEvent(new Event('input',{bubbles:true}));}})()`);
  await click('Log in');await contains('Logged in for this tab');
 }
 await login('merchant');
 for(const expected of ['processing','shipped','delivered']){await click('Advance simulated fulfillment');await waitFor(async()=>{const s=await text();return s.includes(`· ${expected} ·`);});}
 await click('Order details');await contains('order.delivered');
 await click('Log out');
 await send('Page.navigate',{url:origin});await login('buyer');
 await click('Order details');await contains('order.delivered');
 await click('Refresh notifications');await contains('Loading notifications…');await contains('Mark read');
 await click('Mark read');await contains(' · Read');
 unavailable=true;await click('Refresh notifications');await contains('Notifications unavailable. Please retry.');
 unavailable=false;await click('Refresh notifications');await contains(' · Read');
 for(const width of [1280,768,360]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),`Overflow at ${width}px`);
 }
 await click('Log out');
 assert(!(await text()).includes('order.delivered'),'Private timeline survives logout');
 // Fresh synthetic run exercises the notification empty state.
 timeline.splice(1);await login('buyer');await click('Refresh notifications');await contains('No recorded activity.');
 console.log('PASS browser UI fixture: merchant fulfillment, buyer timeline, notifications/read/retry/empty, logout privacy and responsive widths. Backend security requires PostgreSQL CI.');
}
main().catch(e=>{console.error(`FAIL browser UI fixture: ${e.message}`);process.exitCode=1;}).finally(async()=>{
 socket?.close();
 for(const child of [chrome,web])if(child){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),pause(2000)]);if(child.exitCode===null)child.kill('SIGKILL');}
 if(api?.listening)await new Promise(r=>api.close(r));
 if(profile)rmSync(profile,{recursive:true,force:true});
});
