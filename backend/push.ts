import webpush from 'npm:web-push@3.6.7';
const unwrap=({data,error}:any)=>{if(error)throw Error(error.message);return data;};
const allowedEndpoint=(raw:string)=>{try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&(!u.port||u.port==='443')&&(u.hostname==='fcm.googleapis.com'||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.push.apple.com')||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.push.services.mozilla.com')||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}};
async function config(db:any,create=false){let row=unwrap(await db.from('wellness_push_config').select('*').eq('id',1).maybeSingle());if(!row&&create){const keys=webpush.generateVAPIDKeys();unwrap(await db.from('wellness_push_config').upsert({id:1,public_key:keys.publicKey,private_key:keys.privateKey},{onConflict:'id',ignoreDuplicates:true}));row=unwrap(await db.from('wellness_push_config').select('*').eq('id',1).single());}return row;}
async function send(row:any,keys:any,payload:any){
 if(!allowedEndpoint(row.endpoint))throw Error('Unsupported notification endpoint');
 const request=webpush.generateRequestDetails({endpoint:row.endpoint,keys:row.keys},JSON.stringify(payload),{TTL:86400,urgency:'normal',vapidDetails:{subject:'https://oonjai-marketplace.github.io/Wellness/',publicKey:keys.public_key,privateKey:keys.private_key}});
 const response=await fetch(request.endpoint,{method:request.method,headers:request.headers,body:request.body,redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Object.assign(Error('Notification service unavailable'),{status:response.status});
}
export async function pushAction(db:any,user:any,b:any){
 if(user.role!=='admin'||user.status!=='active'||user.temporary_password)throw Error('Administrator required');
 if(b.action==='push-key')return {publicKey:(await config(db,true)).public_key};
 if(b.action==='push-subscribe'){
  const sub=b.subscription;if(!sub||!allowedEndpoint(sub.endpoint)||sub.endpoint.length>2048||!/^[A-Za-z0-9_-]{86,88}$/.test(sub.keys?.p256dh||'')||!/^[A-Za-z0-9_-]{22,24}$/.test(sub.keys?.auth||''))throw Error('Invalid notification subscription');
  const existing=unwrap(await db.from('wellness_push_subscriptions').select('user_id').eq('endpoint',sub.endpoint).maybeSingle());if(existing&&existing.user_id!==user.id)throw Error('This browser is subscribed to another account. Disable notifications there first.');
  unwrap(await db.from('wellness_push_subscriptions').upsert({user_id:user.id,endpoint:sub.endpoint,keys:{p256dh:sub.keys.p256dh,auth:sub.keys.auth}},{onConflict:'endpoint'}));return {ok:true};
 }
 if(b.action==='push-unsubscribe'){unwrap(await db.from('wellness_push_subscriptions').delete().eq('user_id',user.id).eq('endpoint',String(b.endpoint||'')));return {ok:true};}
 if(b.action==='push-test'){
  const rows=unwrap(await db.from('wellness_push_subscriptions').select('*').eq('user_id',user.id).eq('endpoint',String(b.endpoint||'')));if(!rows.length)throw Error('Enable notifications on this phone first');
  const keys=await config(db);await send(rows[0],keys,{title:'Wellness notifications are ready',body:'This phone can receive administrator review alerts.',tag:'wellness-test',url:'./#settings'});return {ok:true};
 }
 throw Error('Unknown notification action');
}
export async function queuePush(db:any,id:string){unwrap(await db.from('wellness_push_jobs').upsert({id},{onConflict:'id',ignoreDuplicates:true}));await deliverPush(db);}
export async function deliverPush(db:any){
 const keys=await config(db);if(!keys)return;
 const rows=unwrap(await db.from('wellness_push_subscriptions').select('id,user_id,endpoint,keys,wellness_members!inner(role,status,temporary_password)').eq('wellness_members.role','admin').eq('wellness_members.status','active').eq('wellness_members.temporary_password',false));if(!rows.length)return;
 const jobs=unwrap(await db.rpc('wellness_push_claim'));for(const job of jobs){let failed=false;await Promise.all(rows.map(async(row:any)=>{try{await send(row,keys,{title:'Wellness review needed',body:'A conflicting submission is waiting for an administrator. Open Wellness to review it.',tag:'wellness-review-'+job.id,url:'./#home'});}catch(error:any){if([404,410].includes(error.status))await db.from('wellness_push_subscriptions').delete().eq('id',row.id);else failed=true;}}));if(!failed)unwrap(await db.from('wellness_push_jobs').update({completed_at:new Date().toISOString()}).eq('id',job.id));}
}
