// Shared by the gateway and phone cache. Missing access timestamps fail closed.
export function accessSince(member, membership) {
  const joined=Date.parse(membership?.joined_at), created=Date.parse(member?.created_at);
  return Number.isFinite(joined)&&Number.isFinite(created)?Math.max(joined,created):Infinity;
}
export function laoDay(value) {
  const time=typeof value==='number'?value:Date.parse(value);
  return Number.isFinite(time)?new Date(time+7*3600000).toISOString().slice(0,10):'9999-12-31';
}
export function canSeeEvent(member,memberships,event) {
  if(member?.status!=='active'||member?.temporary_password||!event)return false;
  if(member.role==='admin')return true;
  const membership=memberships.find(x=>x.mission_id===event.mission_id&&x.active!==false);
  return !!membership&&event.starts>=laoDay(accessSince(member,membership));
}
export function canSeeRecord(member,memberships,events,record) {
  const event=events.find(e=>e.id===record.event_id);
  if(!canSeeEvent(member,memberships,event))return false;
  if(member.role==='admin')return true;
  return Date.parse(record.created_at)>=accessSince(member,memberships.find(x=>x.mission_id===event.mission_id&&x.active!==false));
}
export function normalizePeople(rows) {
  if(!Array.isArray(rows)||rows.length<1||rows.length>50)throw Error('Enter 1–50 volunteers per batch.');
  const seen=new Set();return rows.map((row,i)=>{
    const name=String(row.name||'').trim(),email=String(row.email||'').trim().toLowerCase();
    if(!name||name.length>120||email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Check the full name and email on row '+(i+1)+'.');
    if(seen.has(email))throw Error('Email repeated in this batch: '+email);seen.add(email);return {name,email};
  });
}
