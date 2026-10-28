import {canSeeEvent} from './access.js';
const unwrap=({data,error}:any)=>{if(error)throw Error(error.message);return data;};
const now=()=>new Date().toISOString();
const REMINDER='Team sync reminder',CONFIRM='Phone sync confirmation',REOPEN='Phone sync reopened',READ='Sync reminder read';
async function all(query:()=>any){const out:any[]=[];for(let n=0;;n+=500){const rows=unwrap(await query().range(n,n+499));out.push(...rows);if(rows.length<500)return out;if(out.length>100000)throw Error('Choose a smaller event.');}}
const receiptFields='id,user_id,created_at,result,device_id:operation->>device_id,station_name:operation->>station';
async function receiptMark(rows:any[]){const data=rows.map(r=>r.id+'|'+r.result.status).sort().join(',');const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data));return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');}
function activeAdmin(user:any){if(user.role!=='admin'||user.status!=='active'||user.temporary_password)throw Error('Administrator access required.');}
async function markers(db:any,event:string){return all(()=>db.from('wellness_audit').select('id,actor,station,after_data,created_at').eq('event_id',event).in('station',[CONFIRM,REOPEN]).order('created_at',{ascending:false}).order('id'));}
function latestMarker(rows:any[],device:string){return rows.find(r=>r.after_data?.device_id===device);}
async function completion(marker:any,receipts:any[],pending:number,conflicts:number){return !pending&&!conflicts&&marker?.station===CONFIRM&&marker.after_data.receipt_mark===await receiptMark(receipts)?marker.created_at:null;}
export async function phoneReport(db:any,user:any,event:any,b:any){
 const device=unwrap(await db.from('wellness_devices').select('id,user_id,retired').eq('id',b.device_id).eq('user_id',user.id).maybeSingle());if(!device||device.retired)throw Error('Unknown phone.');
 if(!unwrap(await db.rpc('wellness_can_access_day',{p_actor:user.id,p_event:event.id})))throw Error('This day is outside your access.');
 const receipts=await all(()=>db.from('wellness_receipts').select(receiptFields).eq('operation->>event_id',event.id).eq('operation->>device_id',device.id).order('id'));
 const conflicts=receipts.filter(r=>r.result.status==='conflict').length,review=Math.max(conflicts,b.review_count||0),previous=latestMarker(await markers(db,event.id),device.id);
 if(b.finish&&(b.pending||review))throw Error('Upload remaining entries and resolve review items before confirming.');
 if(b.finish&&b.last_saved_id&&!receipts.some(r=>r.id===b.last_saved_id&&r.user_id===user.id&&['saved','reviewed'].includes(r.result.status)))throw Error('The latest saved entry has not been received. Sync again.');
 const status=unwrap(await db.from('wellness_device_status').upsert({event_id:event.id,device_id:device.id,user_id:user.id,pending:b.pending,last_seen:now()}).select().single());
 let marker=previous;
 if(b.finish||((b.pending||review)&&previous?.station===CONFIRM))marker=unwrap(await db.from('wellness_audit').insert({event_id:event.id,station:b.finish?CONFIRM:REOPEN,actor:user.id,after_data:{device_id:device.id,receipt_mark:await receiptMark(receipts),last_saved_id:b.last_saved_id||null}}).select().single());
 return {...status,review_count:review,finished_at:await completion(marker,receipts,b.pending,review)};
}
export async function syncOverview(db:any,user:any,event:any){
 activeAdmin(user);
 const [status,receipts,marks,memberships,allMembers,records]=await Promise.all([
  all(()=>db.from('wellness_device_status').select('*').eq('event_id',event.id).order('device_id')),
  all(()=>db.from('wellness_receipts').select(receiptFields).eq('operation->>event_id',event.id).order('id')),
  markers(db,event.id),all(()=>db.from('wellness_mission_members').select('*').eq('mission_id',event.mission_id).eq('active',true).order('user_id')),
  all(()=>db.from('wellness_members').select('id,name,role,status,temporary_password,created_at').order('id')),
  all(()=>db.from('wellness_records').select('device_id,author,station,updated_at').eq('event_id',event.id).order('guest_id').order('station'))]);
 const deviceIDs=[...new Set([...status.map(s=>s.device_id),...receipts.map(r=>r.device_id),...records.map(r=>r.device_id)].filter(Boolean))];
 const devices=deviceIDs.length?await all(()=>db.from('wellness_devices').select('id,user_id,label,prefix,code').in('id',deviceIDs).order('id')):[];
 const phones=await Promise.all(devices.map(async(d:any)=>{const rs=receipts.filter(r=>r.device_id===d.id),s=status.find(s=>s.device_id===d.id),conflicts=rs.filter(r=>r.result.status==='conflict').length,legacy=records.filter(r=>r.device_id===d.id);return {device_id:d.id,user_id:d.user_id,label:d.label,phone_code:d.prefix+'-'+d.code,received:rs.length?rs.filter(r=>r.result.status==='saved').length:legacy.length,reviewed:rs.filter(r=>r.result.status==='reviewed').length,conflicts,review_count:conflicts,pending:s?.pending??null,last_seen:s?.last_seen||null,last_received:rs.map(r=>r.created_at).sort().at(-1)||null,stations:[...new Set([...rs.map(r=>r.station_name),...legacy.map(r=>r.station)])],finished_at:await completion(latestMarker(marks,d.id),rs,s?.pending||0,conflicts)};}));
 const team=allMembers.filter(m=>phones.some(p=>p.user_id===m.id)||(memberships.some(mm=>mm.user_id===m.id)&&canSeeEvent(m,memberships.filter(mm=>mm.user_id===m.id),event)));
 const subs=team.length?await all(()=>db.from('wellness_push_subscriptions').select('user_id,id').in('user_id',team.map(m=>m.id)).order('id')):[];
 const latest=unwrap(await db.from('wellness_audit').select('id,after_data,created_at').eq('event_id',event.id).eq('station',REMINDER).order('created_at',{ascending:false}).limit(1));
 const reminder=latest[0]?{id:latest[0].id,created_at:latest[0].created_at,recipients:latest[0].after_data.recipients}:null;
 return {event_id:event.id,members:team.map(m=>({id:m.id,name:m.name,status:m.status,notifications:subs.some(s=>s.user_id===m.id)})),phones,reminder,as_of:now()};
}
export async function createReminder(db:any,user:any,event:any,id:string){
 activeAdmin(user);const prior=unwrap(await db.from('wellness_audit').select('*').eq('id',id).maybeSingle());if(prior){if(prior.station!==REMINDER||prior.actor!==user.id||prior.event_id!==event.id)throw Error('Reminder identity mismatch.');return {id,recipients:prior.after_data.recipients.length};}
 const recent=unwrap(await db.from('wellness_audit').select('id').eq('event_id',event.id).eq('station',REMINDER).gte('created_at',new Date(Date.now()-300000).toISOString()).limit(1));if(recent.length)throw Error('A reminder was sent recently. Wait five minutes before sending another.');
 const memberships=await all(()=>db.from('wellness_mission_members').select('*').eq('mission_id',event.mission_id).eq('active',true).order('user_id'));
 const used=await all(()=>db.from('wellness_device_status').select('user_id,device_id').eq('event_id',event.id).order('device_id'));
 const ids=[...new Set([...memberships.map(m=>m.user_id),...used.map(s=>s.user_id)])];
 const members=ids.length?await all(()=>db.from('wellness_members').select('id,role,status,temporary_password,created_at').in('id',ids).order('id')):[];
 const recipients=members.filter(m=>canSeeEvent(m,memberships.filter(mm=>mm.user_id===m.id),event)).map(m=>({user_id:m.id,push_state:'pending',attempts:0}));
 const bucket='sync-reminder:'+event.id+':'+Math.floor(Date.now()/300000);if(!unwrap(await db.rpc('wellness_rate_guard',{p_key:bucket,p_limit:1})))throw Error('A reminder is already being sent. Try again in five minutes.');
 unwrap(await db.from('wellness_audit').insert({id,event_id:event.id,station:REMINDER,actor:user.id,after_data:{recipients,delivery:recipients.length?'queued':'complete',claimed_until:null}}));return {id,recipients:recipients.length};
}
export async function readReminders(db:any,user:any,eventIDs:string[]){
 if(!eventIDs.length)return [];
 const rows=unwrap(await db.from('wellness_audit').select('id,event_id,after_data,created_at').eq('station',REMINDER).in('event_id',eventIDs).order('created_at',{ascending:false}).limit(100));
 const reads=unwrap(await db.from('wellness_audit').select('after_data').eq('station',READ).eq('actor',user.id).order('created_at',{ascending:false}).limit(500));
 return rows.filter((r:any)=>r.after_data.recipients.some((p:any)=>p.user_id===user.id)&&!reads.some((x:any)=>x.after_data.reminder_id===r.id)).map((r:any)=>({id:r.id,event_id:r.event_id,created_at:r.created_at}));
}
export async function acknowledgeReminder(db:any,user:any,id:string){
 const r=unwrap(await db.from('wellness_audit').select('event_id,after_data').eq('id',id).eq('station',REMINDER).single());if(!r.after_data.recipients.some((p:any)=>p.user_id===user.id)||!unwrap(await db.rpc('wellness_can_access_day',{p_actor:user.id,p_event:r.event_id})))throw Error('Reminder is unavailable.');
 const existing=unwrap(await db.from('wellness_audit').select('id').eq('actor',user.id).eq('station',READ).eq('after_data->>reminder_id',id).limit(1));if(!existing.length)unwrap(await db.from('wellness_audit').insert({event_id:r.event_id,station:READ,actor:user.id,after_data:{reminder_id:id}}));return {ok:true};
}
// Compare-and-swap a persisted lease. A failed or interrupted send can be retried;
// accepted recipients are retained and the browser notification tag deduplicates retries.
export async function claimReminders(db:any){
 const candidates=unwrap(await db.from('wellness_audit').select('*').eq('station',REMINDER).eq('after_data->>delivery','queued').order('created_at').limit(50)),claimed=[];
 for(const row of candidates){const before=row.after_data;if(before.claimed_until&&Date.parse(before.claimed_until)>Date.now())continue;
  const recipients=before.recipients.map((r:any)=>r.push_state==='pending'&&(r.attempts>=5||Date.parse(row.created_at)<Date.now()-86400000)?{...r,push_state:'failed'}:r);
  const next={...before,recipients,delivery:recipients.some((r:any)=>r.push_state==='pending')?'queued':'complete',claimed_until:new Date(Date.now()+120000).toISOString()};
  const taken=unwrap(await db.from('wellness_audit').update({after_data:next}).eq('id',row.id).eq('after_data',JSON.stringify(before)).select().maybeSingle());if(taken&&next.delivery==='queued')claimed.push(taken);if(claimed.length>=5)break;
 }return claimed;
}
export async function completeReminder(db:any,row:any,recipients:any[]){const after_data={...row.after_data,recipients,delivery:recipients.some(r=>r.push_state==='pending')?'queued':'complete'};unwrap(await db.from('wellness_audit').update({after_data}).eq('id',row.id).eq('after_data',JSON.stringify(row.after_data)));}
