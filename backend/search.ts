import {accessSince,canSeeEvent,canSeeRecord} from './access.js';

const TABLES={records:'wellness_records',resources:'wellness_resources',audit:'wellness_audit',moves:'wellness_inventory_moves',legacy:'wellness_stock_log'};
const PAGE_SIZE=200;
const unwrap=({data,error}:any)=>{if(error)throw Error(error.message);return data||[];};
async function rows(query:()=>any){const out=[];for(let offset=0;;offset+=500){const page=unwrap(await query().range(offset,offset+499));out.push(...page);if(page.length<500)return out;}}

// Read-only, paged catalog. The authenticated gateway supplies the current member and memberships.
// Never accept a role or list of authorized events from the browser.
export async function searchCatalogPage(db:any,member:any,memberships:any[],input:any){
 if(member.status!=='active'||member.temporary_password)throw Error('Active Wellness access required.');
 const source=input.source,offset=input.offset??0;
 if(!Object.hasOwn(TABLES,source)||!Number.isSafeInteger(offset)||offset<0||offset%PAGE_SIZE!==0)throw Error('Invalid search page.');
 const isAdmin=member.role==='admin';
 if(source==='audit'&&!isAdmin)return {source,items:[],next:null};
 const ids=memberships.filter(m=>m.active!==false).map(m=>m.mission_id);
 const accessible=isAdmin?await rows(()=>db.from('wellness_events').select('*').order('id')):ids.length?await rows(()=>db.from('wellness_events').select('*').in('mission_id',ids).order('id')):[];
 const events=accessible.filter(e=>canSeeEvent(member,memberships,e));
 if(!isAdmin&&!events.length)return {source,items:[],next:null};
 const eventIDs=new Set(events.map(e=>e.id));
 const since=(event:any)=>accessSince(member,memberships.find(m=>m.mission_id===event?.mission_id&&m.active!==false));
 let query=db.from(TABLES[source as keyof typeof TABLES]).select('*');
 if(source==='records')query=query.order('event_id').order('guest_id').order('station');else query=query.order('id');
 if(!isAdmin&&['records','legacy'].includes(source))query=query.in('event_id',[...eventIDs]);
 const page=unwrap(await query.range(offset,offset+PAGE_SIZE-1));
 let items:any[]=[];
 if(source==='records')items=page.filter(r=>canSeeRecord(member,memberships,events,r));
 if(source==='resources')items=page.filter(r=>['recipe','appointment'].includes(r.kind)&&(r.event_id?eventIDs.has(r.event_id)&&(isAdmin||Date.parse(r.created_at)>=since(events.find(e=>e.id===r.event_id))):isAdmin||events.some(e=>Date.parse(r.created_at)>=since(e))));
 if(source==='audit')items=page; // Administrators already have authority over all Wellness edit history.
 if(source==='legacy')items=page.filter(r=>eventIDs.has(r.event_id)&&(isAdmin||Date.parse(r.created_at)>=since(events.find(e=>e.id===r.event_id))));
 if(source==='moves'){
  const locations=(await rows(()=>db.from('wellness_inventory_locations').select('*').order('id'))).filter(l=>isAdmin||ids.includes(l.mission_id)&&(!l.event_id||eventIDs.has(l.event_id)));
  const allowed=new Set(locations.map(l=>l.id));
  const sinceLocation=(id:string)=>accessSince(member,memberships.find(m=>m.mission_id===locations.find(l=>l.id===id)?.mission_id&&m.active!==false));
  items=page.filter(r=>isAdmin||(allowed.has(r.from_location)||allowed.has(r.to_location))&&Date.parse(r.created_at)>=Math.min(sinceLocation(r.from_location),sinceLocation(r.to_location))).map(r=>isAdmin?r:{...r,from_location:allowed.has(r.from_location)?r.from_location:null,to_location:allowed.has(r.to_location)?r.to_location:null,note:allowed.has(r.from_location)&&allowed.has(r.to_location)?r.note:'Mission stock movement'});
 }
 return {source,items,next:page.length===PAGE_SIZE?offset+PAGE_SIZE:null};
}
