import {normalizePeople} from './access.js';
const unwrap=({data,error}:any)=>{if(error)throw Error(error.message);return data;};
// Retrying the same admin's batch recovers the original temporary password without storing it.
async function temporaryPassword(secret:string,actor:string,batch:string,email:string){
 const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(actor+'|'+batch+'|'+email)));
 const alphabet='abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
 return 'W7!'+Array.from(bytes.slice(0,10),x=>alphabet[x%alphabet.length]).join('');
}
export async function createPeople(db:any,actor:any,body:any,secret:string){
 const people=normalizePeople(body.people);
 if(!/^[0-9a-f-]{36}$/i.test(body.batch_id||''))throw Error('Start a new volunteer batch.');
 if(body.mission_id){const mission=unwrap(await db.from('wellness_missions').select('id').eq('id',body.mission_id).eq('active',true).maybeSingle());if(!mission)throw Error('Choose an active mission trip.');}
 const results=[];
 for(const person of people){
  let created=false;
  try{
   let account=unwrap(await db.rpc('wellness_find_account',{p_email:person.email}));
   const password=await temporaryPassword(secret,actor.id,body.batch_id,person.email);
   if(!account){
    const result=unwrap(await db.auth.admin.createUser({email:person.email,password,email_confirm:true,app_metadata:{wellness_only:true,wellness_batch:body.batch_id,wellness_provisioned_by:actor.id},user_metadata:{full_name:person.name}}));
    account={id:result.user.id,confirmed:true,batch:body.batch_id,creator:actor.id};created=true;
   }
   const ours=account.batch===body.batch_id&&account.creator===actor.id;
   let member=unwrap(await db.from('wellness_members').select('*').eq('id',account.id).maybeSingle());
   if(!member)member=unwrap(await db.from('wellness_members').insert({id:account.id,email:person.email,name:person.name,status:'active',temporary_password:ours}).select().single());
   if(member.status!=='active')throw Error('Account is '+member.status+'. Review its access before assigning a trip.');
   if(body.mission_id)unwrap(await db.rpc('wellness_team_assign',{p_actor:actor.id,p_mission:body.mission_id,p_users:[account.id],p_active:true}));
   results.push({...person,id:account.id,status:ours&&member.temporary_password?'created':'existing',temporary_password:ours&&member.temporary_password?password:undefined,message:ours&&member.temporary_password?'Use this temporary password, then choose a new password at first login.':account.confirmed?'Existing account: use the current password.':'Existing account: verify the email before signing in. Its password was not changed.'});
  }catch(error){results.push({...person,status:'error',message:(created?'Account created, but setup needs retry. ':'')+(error instanceof Error?error.message:'Unable to add this account.')});}
 }
 return {results};
}
