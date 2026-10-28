import {accessSince,canSeeEvent,canSeeRecord} from './access.js';
import {createPeople} from './team.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {pushAction,queuePush,deliverPush} from './push.ts';
import {STATIONS,validID,validateData,strongPassword,summarize,regularDayID,stockLocation} from './core.js';
const url=Deno.env.get('SUPABASE_URL')!, key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const origin='https://oonjai-marketplace.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
declare const EdgeRuntime:{waitUntil(work:Promise<unknown>):void};
const background=(work:Promise<unknown>)=>{const handled=work.catch(()=>{});if(typeof EdgeRuntime!=='undefined')EdgeRuntime.waitUntil(handled);};
const fail=(message:string):never=>{throw Error(message)};
const unwrap=({data,error}:any)=>{if(error)throw Error(error.message);return data};
const uuid=(v:any)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
async function all(query:()=>any){const out=[];for(let offset=0;;offset+=500){const rows=unwrap(await query().range(offset,offset+499));out.push(...rows);if(rows.length<500)return out;if(out.length>100000)fail('Choose a smaller event.');}}
async function rate(email:string,ip:string){for(const [value,limit] of [[email,5],['ip:'+ip,120]] as [string,number][]){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));const hashed=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');if(!unwrap(await admin.rpc('wellness_rate_guard',{p_key:hashed,p_limit:limit})))fail('Too many attempts. Please try again later.');}}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 try{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405,headers});
 const raw=await req.text();if(raw.length>100000)fail('Request too large.');const b=JSON.parse(raw);
 if(b.action==='signup'){
  const email=String(b.email||'').trim().toLowerCase(),name=String(b.name||'').trim(),password=String(b.password||'');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!name||name.length>120)fail('Enter your name and email.');
  if(!strongPassword(password))fail('Use 7–128 characters including a letter and a number.');
  await rate(email,req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown');
  const created=await admin.auth.admin.createUser({email,password,email_confirm:false,app_metadata:{wellness_only:true},user_metadata:{full_name:name}});
  if(created.error){if(/already|registered|exists/i.test(created.error.message))return new Response(JSON.stringify({message:'If this email is already registered, sign in or use password recovery.'}),{headers});throw created.error;}
  unwrap(await admin.from('wellness_members').insert({id:created.data.user.id,email,name,status:'active'}));
  // Supabase sends its verification email, never an application-supplied password.
  const mail=await admin.auth.resend({type:'signup',email,options:{emailRedirectTo:origin+'/Wellness/'}});
  if(mail.error) return new Response(JSON.stringify({message:'Account created. Verification email could not be sent: '+mail.error.message+'. Use Resend verification before signing in.'}),{headers});
  return new Response(JSON.stringify({message:'Account created. Confirm your email, then return to Wellness and sign in. Enter your mission code to open its daily sessions.'}),{headers});
 }
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');const auth=await admin.auth.getUser(token);
 if(auth.error||!auth.data.user)return new Response(JSON.stringify({error:'Please sign in again.'}),{status:401,headers});
 const user=auth.data.user;
 let m=unwrap(await admin.from('wellness_members').select('*').eq('id',user.id).maybeSingle());
 // Existing shared-account identities may join Wellness, but never grant themselves a role.
 if(!m){m=unwrap(await admin.from('wellness_members').insert({id:user.id,email:user.email,name:String(user.user_metadata.full_name||user.email)}).select().single());}
 if(m.status==='disabled')return new Response(JSON.stringify({error:'Wellness access is disabled.'}),{status:403,headers});
 if(b.action==='password'){
  if(!strongPassword(String(b.password))||b.password.toLowerCase()===m.email.toLowerCase())fail('Choose a strong password different from your email.');
  unwrap(await admin.auth.admin.updateUserById(user.id,{password:b.password}));
  unwrap(await admin.from('wellness_members').update({temporary_password:false}).eq('id',user.id));
  return new Response(JSON.stringify({ok:true}),{headers});
 }
 if(b.action==='join'){
  if(m.temporary_password)fail('Change your temporary password first.');
  await rate('join:'+m.id,req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown');
  const mission_id=unwrap(await admin.rpc('wellness_join',{p_actor:m.id,p_code:String(b.code||'')}));
  return new Response(JSON.stringify({mission_id}),{headers});
 }
 const memberships=unwrap(await admin.from('wellness_mission_members').select('*').eq('user_id',m.id).eq('active',true));
 const canEvent=(e:any)=>canSeeEvent(m,memberships,e);
 const visible=(rows:any[],events:any[])=>rows.filter(r=>canSeeRecord(m,memberships,events,r));
 if(b.action==='bootstrap'){
  if(!m.initials){
   const words=m.name.trim().split(/\s+/),base=((words[0]?.[0]||'W')+(words.at(-1)?.[0]||'V')).toUpperCase().replace(/[^A-Z]/g,'')||'WV';
   for(let n=0;n<8;n++){
    const suffix=n?Array.from(crypto.getRandomValues(new Uint8Array(3)),x=>String.fromCharCode(65+x%26)).join(''):'';
    const initials=(base.length<2?'WV':base)+suffix;
    const attempt=await admin.from('wellness_members').update({initials}).eq('id',m.id).is('initials',null).select().maybeSingle();
    if(attempt.data){m=attempt.data;break;}if(attempt.error&&!attempt.error.message.includes('duplicate'))throw attempt.error;
   }
  }

  if(m.temporary_password||m.status!=='active')return new Response(JSON.stringify({tickets:[],member:m,assignments:[],events:[],members:[],resources:[]}),{headers});

  const ids=memberships.map((a:any)=>a.mission_id);
  const missions=m.role==='admin'?unwrap(await admin.from('wellness_missions').select('*').order('created_at',{ascending:false})):ids.length?unwrap(await admin.from('wellness_missions').select('*').in('id',ids)):[];
  const allEventRows=m.role==='admin'?unwrap(await admin.from('wellness_events').select('*').order('starts',{ascending:false})):ids.length?unwrap(await admin.from('wellness_events').select('*').in('mission_id',ids).order('starts',{ascending:false})):[];
  const eventRows=allEventRows.filter(canEvent);
  const ticketMissions=missions.map((x:any)=>x.id);
  const tickets=ticketMissions.length?await all(()=>admin.from('wellness_ticket_ranges').select('*').in('mission_id',ticketMissions).order('id')):[];
  const events=eventRows.map((e:any)=>({...e,kind:missions.find((m:any)=>m.id===e.mission_id)?.kind||'large'}));
  const members=m.role==='admin'?unwrap(await admin.from('wellness_members').select('*').order('created_at')):[];
  const eventIDs=events.map((e:any)=>e.id);
  const rawTotals=eventIDs.length?await all(()=>admin.from('wellness_records').select('event_id,guest_id,station,data,updated_at,created_at').in('event_id',eventIDs).order('event_id').order('guest_id').order('station')):[];
  const totals=visible(rawTotals,events);
  const approved=new Set(events.filter((e:any)=>e.approval==='approved'&&!e.sample).map((e:any)=>e.id));
  const byDay=new Map();for(const r of totals){if(!byDay.has(r.event_id))byDay.set(r.event_id,[]);byDay.get(r.event_id).push(r);}
  const dailyMetrics=events.map((e:any)=>({...e,metrics:summarize(byDay.get(e.id)||[])}));
  const directory=totals.filter((r:any)=>r.station==='registration');
  const allLocations=await all(()=>admin.from('wellness_inventory_locations').select('*').order('id'));
  const locations=allLocations.filter((l:any)=>m.role==='admin'||ids.includes(l.mission_id)&&(!l.event_id||eventIDs.includes(l.event_id)));
  const locationIDs=locations.map((l:any)=>l.id);
  let balances=locationIDs.length?await all(()=>admin.from('wellness_inventory_balances').select('*').in('location_id',locationIDs).order('location_id').order('grade')):[];
  const issues=totals.filter((r:any)=>r.station==='glasses'&&r.data.status==='Provided').map((r:any)=>({event_id:r.event_id,guest_id:r.guest_id,location_id:stockLocation(events.find((e:any)=>e.id===r.event_id)),grade:r.data.grade,quantity:Number(r.data.quantity)||0,updated_at:r.updated_at}));
  const rawMoves=locationIDs.length?unwrap(await admin.from('wellness_inventory_moves').select('*').or(`from_location.in.(${locationIDs.join(',')}),to_location.in.(${locationIDs.join(',')})`).order('created_at',{ascending:false}).limit(500)):[];
  const rawLegacy=eventIDs.length?unwrap(await admin.from('wellness_stock_log').select('*').in('event_id',eventIDs).order('created_at',{ascending:false}).limit(500)):[];
  const sinceLocation=(id:string)=>{const location=locations.find((l:any)=>l.id===id);return accessSince(m,memberships.find((mm:any)=>mm.mission_id===location?.mission_id));};
  const moves=m.role==='admin'?rawMoves:rawMoves.filter((x:any)=>Date.parse(x.created_at)>=Math.min(sinceLocation(x.from_location),sinceLocation(x.to_location))).map((x:any)=>({...x,from_location:locationIDs.includes(x.from_location)?x.from_location:null,to_location:locationIDs.includes(x.to_location)?x.to_location:null,note:locationIDs.includes(x.from_location)&&locationIDs.includes(x.to_location)?x.note:'Mission stock movement'}));
  const legacy=m.role==='admin'?rawLegacy:rawLegacy.filter((x:any)=>Date.parse(x.created_at)>=sinceLocation('day:'+x.event_id));
  if(m.role!=='admin'){
   // Carry earlier dispensing into opening stock without exposing its guests or history.
   const stockEvents=allEventRows.map((e:any)=>({...e,kind:missions.find((x:any)=>x.id===e.mission_id)?.kind||'large'})).filter((e:any)=>locations.some((l:any)=>l.id===stockLocation(e)));
   const stockRecords=stockEvents.length?await all(()=>admin.from('wellness_records').select('event_id,guest_id,station,data,created_at').in('event_id',stockEvents.map((e:any)=>e.id)).eq('station','glasses').order('event_id').order('guest_id')):[];
   const hidden=stockRecords.filter((r:any)=>r.data.status==='Provided'&&!canSeeRecord(m,memberships,events,r));
   balances=balances.map((b:any)=>({...b,received:Number(b.received)-hidden.filter((r:any)=>r.data.grade===b.grade&&stockLocation(stockEvents.find((e:any)=>e.id===r.event_id))===b.location_id).reduce((n:number,r:any)=>n+Number(r.data.quantity||0),0)}));
  }
  const inventory={locations,balances,issues,moves,legacy,asOf:new Date().toISOString()};
  const joined=m.role==='admin'?await all(()=>admin.from('wellness_mission_members').select('*').order('mission_id').order('user_id')):ids.length?await all(()=>admin.from('wellness_mission_members').select('mission_id,user_id,joined_at,active').in('mission_id',ids).eq('active',true).order('mission_id').order('user_id')):[];const missionCounts:any={};for(const j of joined.filter((j:any)=>j.active!==false))missionCounts[j.mission_id]=(missionCounts[j.mission_id]||0)+1;
  const rosterIDs=[...new Set(joined.map((j:any)=>j.user_id))];
  const roster=m.role==='admin'?members:rosterIDs.length?await all(()=>admin.from('wellness_members').select('id,name,initials').in('id',rosterIDs).order('id')):[];
  const attendanceRows=eventIDs.length?await all(()=>admin.from('wellness_attendance').select('event_id,user_id,status,updated_at').in('event_id',eventIDs).order('event_id').order('user_id')):[];
  const attendance=m.role==='admin'?attendanceRows:attendanceRows.filter((a:any)=>{const e=events.find((e:any)=>e.id===a.event_id);return Date.parse(a.updated_at)>=accessSince(m,memberships.find((mm:any)=>mm.mission_id===e?.mission_id));});
  const grades=unwrap(await admin.from('wellness_grades').select('*').eq('active',true).order('grade'));
  const alerts=m.role==='admin'?unwrap(await admin.from('wellness_receipts').select('id,operation,created_at').eq('result->>status','conflict').order('created_at',{ascending:false}).limit(500)):[];
  if(m.role==='admin')background(deliverPush(admin));
  return new Response(JSON.stringify({roster,teamMemberships:joined,attendance,tickets,member:m,assignments:[],events,members,missions,memberships,grades,alerts,dailyMetrics,missionCounts,directory,inventory,totals:m.role==='admin'?{real:summarize(totals.filter((r:any)=>approved.has(r.event_id)))}:null}),{headers});
 }
 if(m.status!=='active'||m.temporary_password)return new Response(JSON.stringify({error:'Your account is waiting for access or a password change.'}),{status:403,headers});
 const isAdmin=m.role==='admin';
 if(['push-key','push-subscribe','push-unsubscribe','push-test'].includes(b.action))return new Response(JSON.stringify(await pushAction(admin,m,b)),{headers});
 const eventAccess=async(id:string,manage=false)=>{
  if(!uuid(id))fail('Choose a day and location.');const event=unwrap(await admin.from('wellness_events').select('*').eq('id',id).single());
  if(!isAdmin){if(!canEvent(event)||manage)fail('This day is outside your access, or requires an administrator.');}
  return event;
 };
 if(b.action==='regular-setup'){
  if(!isAdmin)fail('Ask your administrator for the regular-visit team code.');
  const existing=unwrap(await admin.from('wellness_missions').select('*').eq('kind','regular').eq('sample',false).eq('active',true).order('created_at').limit(1));
  if(existing.length)return new Response(JSON.stringify(existing[0]),{headers});
  const item={id:crypto.randomUUID(),name:'Regular visits',code:'REG-'+crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase(),kind:'regular',location:'Oon Jai Wellness',notes:'Everyday wellness visits',active:true};
  return new Response(JSON.stringify(unwrap(await admin.rpc('wellness_admin_save',{p_actor:m.id,p_kind:'mission',p_item:item}))),{headers});
 }
 if(b.action==='regular-day'){
  const e=b.event;if(!e||!uuid(e.mission_id)||!/^\d{4}-\d{2}-\d{2}$/.test(e.starts)||!String(e.location||'').trim())fail('Check regular-visit date and location.');
  const location=String(e.location).trim().replace(/\s+/g,' ');if(location.length>200)fail('Location is too long.');
  const id=await regularDayID(e.mission_id,e.starts,location);
  return new Response(JSON.stringify(unwrap(await admin.rpc('wellness_regular_day',{p_actor:m.id,p_item:{id,mission_id:e.mission_id,starts:e.starts,location}}))),{headers});
 }
 if(b.action==='inventory-move'){
  if(!isAdmin)fail('Administrator access required.');const item=b.item;
  if(!item||!uuid(item.id)||!Number.isInteger(Number(item.quantity)))fail('Check stock movement.');
  return new Response(JSON.stringify(unwrap(await admin.rpc('wellness_inventory_move',{p_actor:m.id,p_item:item}))),{headers});
 }
 if(b.action==='history'||b.action==='report-records'){
  const allowedMissions=memberships.map((x:any)=>x.mission_id);
  const accessible=isAdmin?await all(()=>admin.from('wellness_events').select('*').order('id')):allowedMissions.length?await all(()=>admin.from('wellness_events').select('*').in('mission_id',allowedMissions).order('id')):[];
  const ids=accessible.filter(canEvent).map((x:any)=>x.id);
  let records:any[]=[];
  if(b.action==='history'){
   if(!validID(b.person_id))fail('Choose a valid guest profile.');
   const regs=ids.length?await all(()=>admin.from('wellness_records').select('*').in('event_id',ids).eq('station','registration').or(`guest_id.eq.${b.person_id},data->>person_id.eq.${b.person_id}`).order('event_id').order('guest_id')):[];
   const pairs=new Set(regs.map((r:any)=>r.event_id+'|'+r.guest_id)),guests=[...new Set(regs.map((r:any)=>r.guest_id))];
   records=guests.length?(await all(()=>admin.from('wellness_records').select('*').in('event_id',ids).in('guest_id',guests).order('event_id').order('guest_id').order('station'))).filter((r:any)=>pairs.has(r.event_id+'|'+r.guest_id)):[];
  }else{
   if(!Array.isArray(b.event_ids)||b.event_ids.length>500||b.event_ids.some((id:any)=>!uuid(id)||!ids.includes(id)))fail('Choose accessible event days.');
   records=b.event_ids.length?await all(()=>admin.from('wellness_records').select('*').in('event_id',b.event_ids).order('event_id').order('guest_id').order('station')):[];
  }
  return new Response(JSON.stringify({records:visible(records,accessible)}),{headers});
 }
 if(b.action==='ticket-context'){
  if(!uuid(b.mission_id)||(b.device_id&&!uuid(b.device_id))||(b.after!=null&&!Number.isSafeInteger(b.after)))fail('Choose a valid event and phone.');
  return new Response(JSON.stringify(unwrap(await admin.rpc('wellness_ticket_context',{p_actor:m.id,p_mission:b.mission_id,p_device:b.device_id||null,p_after:b.after??null}))),{headers});
 }
 if(b.action==='device'){
  if(!m.initials)fail('Refresh your account to reserve unique initials, then prepare this phone again.');
  if(!uuid(b.id))fail('Invalid phone ID.');
  let d=unwrap(await admin.from('wellness_devices').select('*').eq('id',b.id).maybeSingle());
  if(d&&(d.user_id!==m.id||d.retired))fail('This phone identity is unavailable.');
  if(!d)d=unwrap(await admin.from('wellness_devices').insert({id:b.id,user_id:m.id,prefix:m.initials,label:String(b.label||'Phone').slice(0,80)}).select().single());
  return new Response(JSON.stringify(d),{headers});
 }
 if(b.action==='snapshot'){
  if(!uuid(b.event_id))fail('Choose an event.');
  const currentEvent=await eventAccess(b.event_id);
  const rawRecords=await all(()=>{let q=admin.from('wellness_records').select('*').eq('event_id',b.event_id).order('guest_id').order('station');return q;});
  const records=visible(rawRecords,[currentEvent]);
  const since=accessSince(m,memberships.find((mm:any)=>mm.mission_id===currentEvent.mission_id));
  const resourceRows=await all(()=>admin.from('wellness_resources').select('*').or(`event_id.eq.${b.event_id},event_id.is.null`).order('id'));
  const resources=isAdmin?resourceRows:resourceRows.filter((r:any)=>Date.parse(r.created_at)>=since);
  const audit=isAdmin?unwrap(await admin.from('wellness_audit').select('*').eq('event_id',b.event_id).order('created_at',{ascending:false}).limit(500)):[];
  const conflicts=isAdmin?unwrap(await admin.from('wellness_receipts').select('*').eq('result->>status','conflict').eq('operation->>event_id',b.event_id).order('created_at',{ascending:false}).limit(500)):[];
  const reviewed=unwrap(await admin.from('wellness_receipts').select('id').eq('user_id',m.id).eq('operation->>event_id',b.event_id).eq('result->>status','reviewed'));
  const stock=unwrap(await admin.from('wellness_stock').select('*').eq('event_id',b.event_id));
  const devices=isAdmin?unwrap(await admin.from('wellness_device_status').select('*').eq('event_id',b.event_id)):[];
  return new Response(JSON.stringify({records,resources,audit,conflicts,reviewed,stock,devices}),{headers});
 }
 if(b.action==='submit'){
  const o=b.operation;if(!o||!uuid(o.id)||!uuid(o.event_id)||!uuid(o.device_id)||!validID(o.guest_id)||!STATIONS[o.station as keyof typeof STATIONS])fail('Invalid station record or guest ID.');
  const data=validateData(o.station,o.data);
  if(!o.captured_at||!Number.isFinite(Date.parse(o.captured_at)))fail('Record capture time is required.');
  const op={id:o.id,event_id:o.event_id,device_id:o.device_id,guest_id:o.guest_id,station:o.station,base_revision:o.base_revision||null,data,captured_at:o.captured_at,date_ack:o.date_ack===true};
  const result=unwrap(await admin.rpc('wellness_apply',{p_actor:m.id,p_operation:op}));if(result.status==='conflict')background(queuePush(admin,op.id));return new Response(JSON.stringify(result),{headers});
 }
 if(b.action==='device-status'){
  await eventAccess(b.event_id);if(!uuid(b.device_id)||!Number.isInteger(b.pending)||b.pending<0)fail('Invalid phone status.');
  if(!unwrap(await admin.from('wellness_devices').select('id').eq('id',b.device_id).eq('user_id',m.id).maybeSingle()))fail('Unknown phone.');
  unwrap(await admin.from('wellness_device_status').upsert({event_id:b.event_id,device_id:b.device_id,user_id:m.id,pending:b.pending,last_seen:new Date().toISOString()}));return new Response(JSON.stringify({ok:true}),{headers});
 }
 if(b.action==='approve'){
  await eventAccess(b.event_id,true);if(b.approved===true&&b.phones_confirmed!==true)fail('Confirm every team phone has synced.');
  return new Response(JSON.stringify(unwrap(await admin.rpc('wellness_approve',{p_actor:m.id,p_event:b.event_id,p_approve:b.approved===true}))),{headers});
 }
 if(b.action==='stock'){
  await eventAccess(b.event_id,true);return new Response(JSON.stringify(unwrap(await admin.rpc('wellness_stock_add',{p_actor:m.id,p_id:b.id,p_event:b.event_id,p_grade:b.grade,p_quantity:Number(b.quantity),p_note:String(b.note||'')}))),{headers});
 }
 if(!isAdmin)return new Response(JSON.stringify({error:'Administrator access required.'}),{status:403,headers});
 if(b.action==='member'){
  if(!uuid(b.id)||!['active','pending','disabled'].includes(b.status))fail('Choose a valid account status.');
  const target=unwrap(await admin.from('wellness_members').select('*').eq('id',b.id).single());
  unwrap(await admin.rpc('wellness_member_save',{p_actor:m.id,p_target:b.id,p_role:b.role||target.role,p_status:b.status}));
  return new Response(JSON.stringify({ok:true}),{headers});
 }
 if(b.action==='mission'){
  const mission=b.mission;if(!uuid(mission.id)||!mission.name?.trim()||!/^[A-Z0-9][A-Z0-9 -]{3,49}$/.test(mission.code))fail('Enter a mission name and a code with 4–50 letters, numbers, spaces or hyphens.');
  const item={id:mission.id,revision:mission.revision||null,name:mission.name.trim().slice(0,150),code:mission.code,notes:String(mission.notes||'').slice(0,4000),active:mission.active!==false,country:String(mission.country||'Laos').trim().slice(0,60),province:String(mission.province||'').trim().slice(0,120),kind:mission.kind||'large',location:String(mission.location||'Oon Jai Wellness').trim().slice(0,200)};
  return new Response(JSON.stringify(unwrap(await admin.rpc('wellness_admin_save',{p_actor:m.id,p_kind:'mission',p_item:item}))),{headers});
 }
 if(b.action==='grade'){
  const grade=Number(b.grade);if(!Number.isFinite(grade)||grade<=0||grade>30)fail('Enter a positive glasses grade up to 30.');
  const threshold=b.low_stock===undefined?5:Number(b.low_stock);if(!Number.isInteger(threshold)||threshold<0||threshold>100000)fail('Check low-stock threshold.');
  unwrap(await admin.from('wellness_grades').upsert({grade:grade.toFixed(2),active:true,low_stock:threshold}));return new Response(JSON.stringify({ok:true}),{headers});
 }
 if(b.action==='create-users'||b.action==='create-user'){
  return new Response(JSON.stringify(await createPeople(admin,m,b.action==='create-user'?{people:[b],batch_id:b.batch_id||crypto.randomUUID(),mission_id:b.mission_id}:b,key)),{headers});
 }
 if(b.action==='team-assign'){
  if(!uuid(b.mission_id)||!Array.isArray(b.user_ids)||b.user_ids.some((id:any)=>!uuid(id)))fail('Choose a valid mission team.');
  return new Response(JSON.stringify(unwrap(await admin.rpc('wellness_team_assign',{p_actor:m.id,p_mission:b.mission_id,p_users:b.user_ids,p_active:b.active!==false}))),{headers});
 }
 if(b.action==='attendance'){
  if(!uuid(b.event_id)||!Array.isArray(b.rows))fail('Choose a day and attendance list.');
  return new Response(JSON.stringify(unwrap(await admin.rpc('wellness_attendance_save',{p_actor:m.id,p_event:b.event_id,p_rows:b.rows}))),{headers});
 }
 if(b.action==='event'){
  const e=b.event;if(!uuid(e.id)||!uuid(e.mission_id)||!e.name?.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(e.starts)||!/^\d{4}-\d{2}-\d{2}$/.test(e.ends)||e.ends!==e.starts)fail('Check event name and dates.');
  if(!String(e.location||'').trim()||Number.isNaN(Date.parse(e.starts)))fail('Enter a valid location and date.');
  const clean={id:e.id,revision:e.revision||null,mission_id:e.mission_id,name:e.name.trim().slice(0,150),starts:e.starts,location:String(e.location).trim().slice(0,200),country:String(e.country||'Laos').slice(0,60),notes:String(e.notes||'').slice(0,4000),closed:!!e.closed};
  return new Response(JSON.stringify(unwrap(await admin.rpc('wellness_admin_save',{p_actor:m.id,p_kind:'event',p_item:clean}))),{headers});
 }
 if(b.action==='resource'){
  const r=b.resource;if(!uuid(r.id)||!['appointment','recipe'].includes(r.kind)||!r.data||JSON.stringify(r.data).length>20000)fail('Invalid program or appointment.');
  if(r.kind==='appointment'&&!uuid(r.event_id))fail('Choose the appointment day.');
  const clean={id:r.id,kind:r.kind,event_id:r.event_id||null,data:r.data,revision:r.revision||null};
  return new Response(JSON.stringify(unwrap(await admin.rpc('wellness_admin_save',{p_actor:m.id,p_kind:'resource',p_item:clean}))),{headers});
 }
 if(b.action==='resolve'){
  if(!uuid(b.id))fail('Invalid conflict.');
  return new Response(JSON.stringify(unwrap(await admin.rpc('wellness_resolve',{p_actor:m.id,p_id:b.id}))),{headers});
 }
 throw Error('Unknown action.');
 }catch(e){const message=e instanceof Error?e.message:'Request failed.';return new Response(JSON.stringify({error:message.includes('wellness_events_day_location')?'This mission already has a session for that date and location.':message.includes('wellness_missions_code_key')?'This mission code is already in use. Choose another.':message.includes('duplicate key')?'This account or identifier is already reserved.':message}),{status:400,headers});}
});
