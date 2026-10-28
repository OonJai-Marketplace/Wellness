import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../updates.js',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture({current='1.3.1',release='1.3.1',worker=null,failWorker=false}={}){
 const label={},button={},status={},notice={hidden:false,setAttribute(){},querySelector:s=>s==='span'?label:button};let reloads=0,alerts=0,openForm=false;
 const events={},navigator={onLine:true};let registration;
 if(worker||failWorker){registration={installing:worker,update:async()=>{if(failWorker)throw Error('worker unavailable');}};navigator.serviceWorker={register:async()=>registration};}
 const document={baseURI:'https://example.invalid/Wellness/',visibilityState:'visible',body:{append(){}},createElement:()=>notice,querySelector:s=>s.startsWith('script')?{src:'https://example.invalid/Wellness/app.js?v='+current}:s==='dialog[open]'&&openForm?{}:null,getElementById:()=>status,addEventListener:(n,fn)=>events[n]=fn};
 const window={location:{reload:()=>reloads++},addEventListener:(n,fn)=>events[n]=fn};
 const ctx=vm.createContext({window,document,navigator,URL,fetch:async()=>({ok:true,json:async()=>({version:release})}),setInterval(){},setTimeout,clearTimeout,alert:()=>alerts++});
 vm.runInContext(source,ctx);await flush();
 return {notice,label,button,status,window,navigator,events,setRelease:v=>release=v,setOpen:v=>openForm=v,get reloads(){return reloads},get alerts(){return alerts}};
}
const latest=await fixture();assert.equal(latest.window.wellnessUpdates.version,'1.3.1');assert(latest.notice.hidden);await latest.window.wellnessUpdates.check(true);assert(latest.notice.hidden);assert.match(latest.status.textContent,/latest.*1\.3\.1/);
latest.setRelease('1.4.0');await latest.window.wellnessUpdates.check();assert(!latest.notice.hidden);assert.match(latest.label.textContent,/1\.4\.0/);
latest.setRelease('1.3.1');await latest.window.wellnessUpdates.check();assert(latest.notice.hidden);await latest.button.onclick();assert.equal(latest.reloads,0);
latest.setRelease('1.2.0');await latest.window.wellnessUpdates.check();assert(latest.notice.hidden);
latest.setRelease('invalid');await latest.window.wellnessUpdates.check();assert(latest.notice.hidden);
const old=await fixture({current:'1.3.0'});assert(!old.notice.hidden);old.setOpen(true);await old.button.onclick();assert.equal(old.reloads,0);assert.equal(old.alerts,1);old.setOpen(false);old.navigator.onLine=false;await old.button.onclick();assert.equal(old.reloads,0);old.navigator.onLine=true;await old.button.onclick();assert.equal(old.reloads,1);assert(old.notice.hidden);assert((await fixture()).notice.hidden);
const callbacks=new Set(),worker={state:'installing',addEventListener:(n,fn)=>callbacks.add(fn),removeEventListener:(n,fn)=>callbacks.delete(fn)};
const installing=await fixture({current:'1.3.0',worker});const finish=installing.button.onclick();await flush();assert.equal(installing.reloads,0);assert(installing.button.disabled);worker.state='activated';for(const fn of callbacks)fn();await finish;assert.equal(installing.reloads,1);assert.equal(callbacks.size,0);
const failed=await fixture({current:'1.3.0',failWorker:true});assert(!failed.notice.hidden);await failed.button.onclick();assert.equal(failed.reloads,0);assert(!failed.button.disabled);assert.match(failed.label.textContent,/not ready/);
const release=JSON.parse(fs.readFileSync(new URL('../version.json',import.meta.url),'utf8')).version;
for(const file of ['index.html','app.js','tickets.js','sw.js']){const text=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');for(const [,v]of text.matchAll(/[?&]v=(\d+\.\d+\.\d+)/g))assert.equal(v,release,file+' has a stale release reference');}
console.log('PASS: current version stays hidden, newer-only notices, repeated checks clear stale notices, reload resolves notice, open-form/offline guards, worker activation/failure and release reference consistency.');

// Every local ES-module dependency must already be in the offline shell cache.
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const files=JSON.parse(sw.match(/const FILES=(\[[^;]+\]);/)[1].replaceAll("'",'"'));
for(const file of ['app.js','tickets.js','record-tools.js','access.js','core.js','navigation.js','vault.js']){
 const text=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
 for(const [,dep] of text.matchAll(/from ['"](\.\/[^'"]+)['"]/g))assert(files.includes(dep),file+' imports an uncached offline dependency: '+dep);
}
console.log('PASS: all local module dependencies are precached for offline startup.');
