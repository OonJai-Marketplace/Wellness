import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {STATIONS,validID,validateData,strongPassword,summarize} from './core.js';
const url=Deno.env.get('SUPABASE_URL')!, key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const origin='https://oonjai-marketplace.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
const fail=(message:string)=>{throw Error(message)};
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
  if(!strongPassword(password))fail('Use 12–128 characters with uppercase, lowercase, number and symbol.');
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

  if(m.temporary_password)return new Response(JSON.stringify({member:m,assignments:[],events:[],members:[],resources:[]}),{headers});
  const memberships=unwrap(await admin.from('wellness_mission_members').select('*').eq('user_id',m.id));
  const ids=memberships.map((a:any)=>a.mission_id);
  const missions=m.role==='admin'?unwrap(await admin.from('wellness_missions').select('*').order('created_at',{ascending:false})):ids.length?unwrap(await admin.from('wellness_missions').select('*').in('id',ids)):[];
  const events=m.role==='admin'?unwrap(await admin.from('wellness_events').select('*').order('starts',{ascending:false})):ids.length?unwrap(await admin.from('wellness_events').select('*').in('mission_id',ids).order('starts',{ascending:false})):[];
  const members=m.role==='admin'?unwrap(await admin.from('wellness_members').select('*').order('created_at')):[];
  const totals=m.role==='admin'?await all(()=>admin.from('wellness_records').select('event_id,guest_id,station,data').order('event_id').order('guest_id').order('station')):[];
  const approved=new Set(events.filter((e:any)=>e.approval==='approved'&&!e.sample).map((e:any)=>e.id));
  const grades=unwrap(await admin.from('wellness_grades').select('*').eq('active',true).order('grade'));
  const alerts=m.role==='admin'?unwrap(await admin.from('wellness_receipts').select('id,operation,created_at').eq('result->>status','conflict').order('created_at',{ascending:false}).limit(500)):[];
  return new Response(JSON.stringify({member:m,assignments:[],events,members,missions,memberships,grades,alerts,totals:m.role==='admin'?{real:summarize(totals.filter((r:any)=>approved.has(r.event_id)))}:null}),{headers});
 }
 if(m.status!=='active'||m.temporary_password)return new Response(JSON.stringify({error:'Your account is waiting for access or a password change.'}),{status:403,headers});
 const isAdmin=m.role==='admin';
 const eventAccess=async(id:string,manage=false)=>{
  if(!uuid(id))fail('Choose a day and location.');const event=unwrap(await admin.from('wellness_events').select('*').eq('id',id).single());
  if(!isAdmin){const membership=unwrap(await admin.from('wellness_mission_members').select('*').eq('user_id',m.id).eq('mission_id',event.mission_id).maybeSingle());if(!membership||(manage&&membership.role!=='admin'))fail('Join this mission first, or ask a mission administrator.');}
  return event;
 };
 if(b.action==='device'){
  if(!m.initials)fail('An administrator must reserve your initials first.');
  if(!uuid(b.id))fail('Invalid phone ID.');
  let d=unwrap(await admin.from('wellness_devices').select('*').eq('id',b.id).maybeSingle());
  if(d&&(d.user_id!==m.id||d.retired))fail('This phone identity is unavailable.');
  if(!d)d=unwrap(await admin.from('wellness_devices').insert({id:b.id,user_id:m.id,prefix:m.initials,label:String(b.label||'Phone').slice(0,80)}).select().single());
  return new Response(JSON.stringify(d),{headers});
 }
 if(b.action==='snapshot'){
  if(!uuid(b.event_id))fail('Choose an event.');
  await eventAccess(b.event_id);
  const records=await all(()=>{let q=admin.from('wellness_records').select('*').eq('event_id',b.event_id).order('guest_id').order('station');return q;});
  const resources=isAdmin?await all(()=>admin.from('wellness_resources').select('*').or(`event_id.eq.${b.event_id},event_id.is.null`).order('id')):[];
  const audit=isAdmin?unwrap(await admin.from('wellness_audit').select('*').eq('event_id',b.event_id).order('created_at',{ascending:false}).limit(500)):[];
  const conflicts=isAdmin?unwrap(await admin.from('wellness_receipts').select('*').eq('result->>status','conflict').eq('operation->>event_id',b.event_id).order('created_at',{ascending:false}).limit(500)):[];
  const reviewed=unwrap(await admin.from('wellness_receipts').select('id').eq('user_id',m.id).eq('operation->>event_id',b.event_id).eq('result->>status','reviewed'));
  const stock=unwrap(await admin.from('wellness_stock').select('*').eq('event_id',b.event_id));
  const devices=isAdmin?unwrap(await admin.from('wellness_device_status').select('*').eq('event_id',b.event_id)):[];
  return new Response(JSON.stringify({records,resources,audit,conflicts,reviewed,stock,devices}),{headers});
 }
 if(b.action==='submit'){
  const o=b.operation;if(!o||!uuid(o.id)||!uuid(o.event_id)||!uuid(o.device_id)||!validID(o.guest_id)||!STATIONS[o.station])fail('Invalid station record or guest ID.');
  const data=validateData(o.station,o.data);
  if(!o.captured_at||!Number.isFinite(Date.parse(o.captured_at)))fail('Record capture time is required.');
  const op={id:o.id,event_id:o.event_id,device_id:o.device_id,guest_id:o.guest_id,station:o.station,base_revision:o.base_revision||null,data,captured_at:o.captured_at,date_ack:o.date_ack===true};
  return new Response(JSON.stringify(unwrap(await admin.rpc('wellness_apply',{p_actor:m.id,p_operation:op}))),{headers});
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
  if(target.role==='admin'&&b.status!=='active')fail('Owner accounts must remain active.');
  unwrap(await admin.from('wellness_members').update({status:b.status}).eq('id',b.id));
  return new Response(JSON.stringify({ok:true}),{headers});
 }
 if(b.action==='mission'){
  const mission=b.mission;if(!uuid(mission.id)||!mission.name?.trim()||!/^[A-Z0-9][A-Z0-9 -]{3,49}$/.test(mission.code))fail('Enter a mission name and a code with 4–50 letters, numbers, spaces or hyphens.');
  const old=unwrap(await admin.from('wellness_missions').select('*').eq('id',mission.id).maybeSingle());
  unwrap(await admin.from('wellness_missions').upsert({id:mission.id,name:mission.name.slice(0,150),code:mission.code,notes:String(mission.notes||'').slice(0,4000),sample:old?.sample||false,active:mission.active!==false}));
  return new Response(JSON.stringify({ok:true}),{headers});
 }
 if(b.action==='grade'){
  const grade=Number(b.grade);if(!Number.isFinite(grade)||grade<=0||grade>30)fail('Enter a positive glasses grade up to 30.');
  unwrap(await admin.from('wellness_grades').upsert({grade:grade.toFixed(2),active:true}));return new Response(JSON.stringify({ok:true}),{headers});
 }
 if(b.action==='create-user'){
  const email=String(b.email||'').trim().toLowerCase(),name=String(b.name||'').trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name)fail('Enter a valid name and email.');
  const created=unwrap(await admin.auth.admin.createUser({email,password:email,email_confirm:false,app_metadata:{wellness_only:true},user_metadata:{full_name:name}}));
  unwrap(await admin.from('wellness_members').insert({id:created.user.id,email,name,status:'active',temporary_password:true}));
  const mail=await admin.auth.resend({type:'signup',email,options:{emailRedirectTo:origin+'/Wellness/'}});
  return new Response(JSON.stringify({ok:true,message:mail.error?'Account created; use Resend verification.':'Account created. Confirm email, then use email as the temporary password and choose a new password.'}),{headers});
 }
 if(b.action==='event'){
  const e=b.event;if(!uuid(e.id)||!uuid(e.mission_id)||!e.name?.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(e.starts)||!/^\d{4}-\d{2}-\d{2}$/.test(e.ends)||e.ends!==e.starts)fail('Check event name and dates.');
  const old=unwrap(await admin.from('wellness_events').select('*').eq('id',e.id).maybeSingle());
  if(old?.approval==='approved')fail('Reopen the approved day before editing it.');
  const clean={id:e.id,mission_id:e.mission_id,name:e.name.slice(0,150),starts:e.starts,ends:e.ends,location:String(e.location||'').trim().slice(0,200),country:String(e.country||'Laos').slice(0,60),frequency:String(e.frequency||'One-time').slice(0,60),notes:String(e.notes||'').slice(0,4000),closed:!!e.closed,sample:old?.sample||false};
  unwrap(await admin.from('wellness_events').upsert(clean));
  if(old&&JSON.stringify(old)!==JSON.stringify(clean))unwrap(await admin.from('wellness_audit').insert({event_id:e.id,station:'Event',actor:m.id,before_data:old,after_data:clean}));
  return new Response(JSON.stringify(clean),{headers});
 }
 if(b.action==='resource'){
  const r=b.resource;if(!uuid(r.id)||!['appointment','recipe'].includes(r.kind)||!r.data||JSON.stringify(r.data).length>20000)fail('Invalid program or appointment.');
  const old=unwrap(await admin.from('wellness_resources').select('*').eq('id',r.id).maybeSingle());
  if(old&&old.revision!==r.revision)fail('This item changed. Sync before editing.');
  const clean={id:r.id,kind:r.kind,event_id:r.event_id||null,data:r.data,sample:old?.sample||false,revision:crypto.randomUUID()};
  unwrap(await admin.from('wellness_resources').upsert(clean));
  if(old)unwrap(await admin.from('wellness_audit').insert({event_id:r.event_id||null,station:r.kind,actor:m.id,before_data:old.data,after_data:r.data}));
  return new Response(JSON.stringify(clean),{headers});
 }
 if(b.action==='resolve'){
  if(!uuid(b.id))fail('Invalid conflict.');
  unwrap(await admin.from('wellness_receipts').update({result:{status:'reviewed',reviewed_by:m.id,message:'Administrator reviewed this submission.'}}).eq('id',b.id).eq('result->>status','conflict'));
  return new Response(JSON.stringify({ok:true}),{headers});
 }
 fail('Unknown action.');
 }catch(e){const message=e instanceof Error?e.message:'Request failed.';return new Response(JSON.stringify({error:message.includes('wellness_events_day_location')?'This mission already has a session for that date and location.':message.includes('wellness_missions_code_key')?'This mission code is already in use. Choose another.':message.includes('duplicate key')?'This account or identifier is already reserved.':message}),{status:400,headers});}
});
