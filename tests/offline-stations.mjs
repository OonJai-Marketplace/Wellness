import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
import * as recordTools from '../record-tools.js';import * as core from '../core.js';import * as tickets from '../tickets.js';import * as access from '../access.js';import * as navigation from '../navigation.js';
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Vientiane',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const event={id:'day-a',mission_id:'mission-a',kind:'large',starts:day,location:'Village A',closed:false};
const second={...event,id:'day-b',mission_id:'mission-b',location:'Village B'};
const range={id:11,mission_id:event.mission_id,device_id:'registration-phone',prefix:'QA',device_code:1,first_number:1,last_number:500};
const otherRange={...range,id:12,mission_id:second.mission_id,device_id:'other-registration'};
const blank=()=>({user:{id:'volunteer',name:'Fictional volunteer',role:'volunteer',status:'active',created_at:'2020-01-01',initials:'QA'},deviceId:'station-phone',device:{id:'station-phone',user_id:'volunteer'},tickets:[],queue:[],events:[event,second],missions:[{id:event.mission_id,kind:'large'},{id:second.mission_id,kind:'large'}],memberships:[event,second].map(e=>({mission_id:e.mission_id,active:true,joined_at:'2020-01-01'})),members:[],snapshots:{},grades:[{grade:'1.00'}],preparedUntil:Date.now()+86400000});
let serverRanges=[range,otherRange],serverRecords=[],receipts=new Set(),requests=[],failAfterSave=false,holdBootstrap=null;
async function api(action,data,state){
 requests.push(action);
 if(action==='bootstrap'){if(holdBootstrap)await holdBootstrap;return {...structuredClone(state),member:state.user,tickets:serverRanges,events:[event,second],directory:serverRecords.filter(r=>r.station==='registration')};}
 if(action==='device')return {id:data.id,user_id:state.user.id};
 if(action==='ticket-context')return {ranges:serverRanges.filter(r=>r.mission_id===data.mission_id)};
 if(action==='submit'){const o=structuredClone(data.operation);assert(core.validID(o.guest_id),'Only canonical IDs reach the existing server');if(!receipts.has(o.id)){receipts.add(o.id);serverRecords.push({...o,revision:o.id});}if(failAfterSave){failAfterSave=false;throw Error('Connection lost after server saved');}return {status:'saved'};}
 if(action==='snapshot')return {records:serverRecords.filter(r=>r.event_id===data.event_id),resources:[],audit:[],conflicts:[],reviewed:[]};
 if(action==='device-status')return {...data,last_seen:new Date().toISOString(),finished_at:data.finish?new Date().toISOString():null};
 throw Error('Unexpected API action '+action);
}
function phone(initial=blank()){
 const elements=new Map();const element=s=>{if(!elements.has(s))elements.set(s,{hidden:false,open:false,value:'',classList:{add(){},remove(){},toggle(){}},showModal(){this.open=true},close(){this.open=false},querySelector:element});return elements.get(s)};
 class Vault{constructor(){this.key=true;this.email='fictional@example.invalid';this.state=structuredClone(initial)}async edit(fn){const next=structuredClone(this.state);const result=fn(next);this.state=next;return result}async reload(){return this.state}}
 const navigator={onLine:false,userAgent:'QA',locks:{request:async(n,fn)=>fn()},storage:{persist:async()=>true}};
 const sb={auth:{onAuthStateChange(){}}};const ctx=vm.createContext({...recordTools,...core,...tickets,...access,...navigation,Vault,crypto:webcrypto,navigator,console,URLSearchParams,URL,TextEncoder,AbortSignal,FormData,Intl,Date,structuredClone,queueMicrotask,setTimeout:()=>0,clearTimeout(){},setInterval(){},confirm:()=>true,localStorage:{getItem(){return ''}},location:{hash:''},window:{WELLNESS_CONFIG:{},supabase:{createClient:()=>sb},addEventListener(){}},document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){},activeElement:null},mockAPI:api});
 const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'');
 vm.runInContext(source+`\nstate=vault.state;missionID='mission-a';eventID='day-a';focusedMissionID='mission-a';render=()=>{};updateStatus=()=>{};toast=()=>{};api=(a,d={})=>mockAPI(a,d,vault.state);show=(title,html,submit,handler)=>{globalThis.modal={title,html,submit:handler};$('#dialog').open=true;};globalThis.test={finishPhone,stationForm,guestDetail,nextStationGuest,chooseContext,ensureDevice,sync,refreshAccess,lookupID,enterEvent,action,load(s){vault.state=s;state=s},get state(){return vault.state},get busy(){return busy},get event(){return eventID},get mission(){return missionID},get error(){return syncError}};`,ctx);
 return {t:ctx.test,ctx,navigator,get modal(){return ctx.modal},close(){element('#dialog').close()}};
}
const registration=phone({...blank(),deviceId:'registration-phone',device:{id:'registration-phone'},tickets:[range]});
await registration.t.stationForm('registration');assert.match(registration.modal.html,/A0001/);
await registration.modal.submit({name:'Fictional guest',language:'Lao'});
const canonical=registration.t.state.queue[0].guest_id;assert.equal(canonical,tickets.ticketRecordID(range,0));
const station=phone();const samples={measurements:{height:'160',weight:'60'},glasses:{status:'Provided',grade:'1.00',quantity:'1'},dental:{status:'Completed'},assessment:{systolic:'120',diastolic:'80'},consultation:{notes:'Fictional consultation'},programs:{education:'Completed'}};
station.t.guestDetail(station.t.lookupID(' a 0001 '));assert.match(station.modal.html,/Registration has not reached/);assert(!station.modal.html.includes('data-id="A0001|registration"'));
for(const [st,data]of Object.entries(samples)){await station.t.stationForm(st,'A0001');await station.modal.submit({...data});assert.match(station.modal.html,/A0001/);}
assert.equal(station.t.state.queue.length,6);assert(station.t.state.queue.every(q=>q.guest_id==='A0001'));assert.equal(requests.length,0,'No server lookup is needed at any offline station');
station.t.nextStationGuest('dental');await station.modal.submit({next_guest:'A0002'});assert.match(station.modal.title,/Dental/);await station.modal.submit({status:'Completed'});
await station.t.stationForm('dental','A0001');await assert.rejects(()=>station.modal.submit({status:'Completed'}),/already has a record/);
const saved=structuredClone(station.t.state);const restarted=phone(saved);restarted.t.guestDetail('A0001');assert.match(restarted.modal.html,/Saved on phone/,'Saved short-ID entries survive a restart');
// Sync a different selected event: queued paper IDs must use their own event, not the open page.
await restarted.t.chooseContext({missionID:'mission-b',eventID:'day-b'});restarted.navigator.onLine=true;await restarted.t.sync();assert.equal(restarted.t.error,'');assert.equal(restarted.t.state.queue.length,0);assert(serverRecords.filter(r=>r.guest_id===canonical).length===6);
registration.navigator.onLine=true;await registration.t.sync();assert.equal(serverRecords.filter(r=>r.guest_id===canonical).length,7,'Registration arriving last joins every saved service');
const totals=core.summarize(serverRecords);assert.equal(totals.registrations,1);assert.equal(totals.glasses,1);assert.equal(totals.awaiting,1,'Next guest remains separate');
// Retry after a lost response retains the operation UUID and cannot duplicate a service.
const retry=phone();await retry.t.stationForm('dental','A0003');await retry.modal.submit({status:'Completed'});const op=retry.t.state.queue[0].id;failAfterSave=true;retry.navigator.onLine=true;await retry.t.sync();assert.equal(retry.t.state.queue.length,1);await retry.t.sync();assert.equal(retry.t.state.queue.length,0);assert.equal(serverRecords.filter(r=>r.id===op).length,1);
// An unissued ID is retained; it is never guessed, sent under a wrong event or silently lost.
const unresolved=phone();await unresolved.t.stationForm('dental','Z9999');await unresolved.modal.submit({status:'Completed'});unresolved.navigator.onLine=true;await unresolved.t.sync();assert.equal(unresolved.t.state.queue.length,1);assert(unresolved.t.state.queue[0].ticket_pending);assert.equal(unresolved.t.state.queue[0].guest_id,'Z9999');
serverRanges.push({...range,id:99,first_number:259974,last_number:259974});await unresolved.t.sync();assert.equal(unresolved.t.state.queue.length,0);
// Mapping that arrives while a form is open must still link on Save and detect duplicates.
const during=phone();await during.t.stationForm('dental','A0001');const submit=during.modal.submit;during.navigator.onLine=true;await during.t.refreshAccess();during.navigator.onLine=false;await submit({status:'Completed'});assert.equal(during.t.state.queue[0].guest_id,canonical);
// Navigation renders immediately even while its background synchronization is still waiting.
const fresh=phone({...blank(),device:null});fresh.navigator.onLine=true;let release;holdBootstrap=new Promise(r=>release=r);await fresh.t.chooseContext({missionID:'mission-b',eventID:'day-b'});assert.equal(fresh.t.event,'day-b');assert(fresh.t.busy);await Promise.all([fresh.t.ensureDevice(),fresh.t.ensureDevice()]);assert.equal(fresh.t.state.device.id,'station-phone');release();holdBootstrap=null;while(fresh.t.busy)await new Promise(r=>setImmediate(r));assert.equal(fresh.t.error,'');
// Same short number belongs to different canonical people in different events.
assert.notEqual(tickets.stationGuestID('A0001','mission-a',serverRanges),tickets.stationGuestID('A0001','mission-b',serverRanges));
console.log('PASS: real app station handlers accept unknown paper IDs offline at all six stations; registration generation, next guest, duplicate protection, restart, cross-event sync, registration-last merge, lost-response retry, unresolved IDs, mid-form mapping and nonblocking event preparation.');

const finish=phone();await finish.t.stationForm('dental','A0042');await finish.modal.submit({status:'Completed'});finish.navigator.onLine=true;await finish.t.finishPhone();assert(finish.t.state.phoneReports['day-a'].finished_at);assert.equal(finish.t.state.queue.length,0);finish.navigator.onLine=false;await finish.t.stationForm('dental','A0043');await finish.modal.submit({status:'Completed'});assert.equal(finish.t.state.phoneReports['day-a'],undefined);await assert.rejects(()=>finish.t.finishPhone(),/Connect/);
console.log('PASS: finishing uploads and confirms this phone; new offline entries clear its prior confirmation.');
