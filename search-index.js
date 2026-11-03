import {followupAppointments} from './care-schedule.js?v=1.5.0';
import {canSeeEvent,canSeeRecord,accessSince} from './access.js?v=1.5.0';
import {STATIONS,FIELDS,HEALTH_CONDITIONS,FAMILY_HISTORY,SYMPTOMS,LIFESTYLE,SUPPLY_ITEMS} from './core.js?v=1.5.0';
import {GUEST_SECTIONS,GUEST_FIELD_LABELS} from './guest-sections.js?v=1.5.0';

export const SEARCH_PAGES=[
 ['home','Home','overview dashboard daily workspace register new guest'],
 ['events','Events and regular visits','mission trips calendar dates days locations countries provinces team code'],
 ['records','Guest records','all visits names guest ID medical notes history'],
 ['guests','Guest profiles and visit history','returning guest lost slip recover ID'],
 ['stations','Guest form and stations','registration screening personal information'],
 ['inventory','Inventory','stock glasses grade pairs low stock transfers returns received damaged strips instruments'],
 ['reports','Reports','summary charts trends analysis statistics CSV PDF export cholesterol urinalysis'],
 ['daily','Daily report','selected day preliminary approve reopen totals'],
 ['appointments','Appointments','schedule follow up booking'],
 ['programs','Programs and recipes','ingredients instructions allergens servings juicing nutrition activities'],
 ['team','Volunteers and attendance','people teams roster groups present absent excused accounts authority'],
 ['sync','Sync center','offline uploads queue pending errors conflict review phone completion reminders'],
 ['guide','Volunteer guide','help preparation airplane mode practice BMI guest ID station handover'],
 ['more','Tools and phone options','install app password offline preparation notifications'],
 ['settings','Settings','updates version check refresh offline password notifications install app','admin'],
 ['audit','Edit history','audit corrections before after changes','admin']
];
const sensitive=/password|secret|token|credential|private.?key/i;
export function searchableText(value){
 if(value==null)return '';
 if(Array.isArray(value))return value.map(searchableText).join(' ');
 if(typeof value==='object')return Object.entries(value).filter(([key])=>!sensitive.test(key)).map(([key,v])=>(GUEST_FIELD_LABELS[key]||key.replaceAll('_',' ').replace(/([a-z])([A-Z])/g,'$1 $2'))+' '+searchableText(v)).join(' ');
 return String(value);
}
export const normalizeSearch=value=>String(value??'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
export function searchAccessKey(state){return JSON.stringify([state.user?.id,state.user?.role,state.user?.status,state.user?.temporary_password,state.user?.created_at,(state.memberships||[]).map(m=>[m.mission_id,m.joined_at,m.active]).sort(),(state.events||[]).map(e=>[e.id,e.mission_id,e.starts]).sort(),(state.inventory?.locations||[]).map(l=>l.id).sort()]);}
export function resourceAccessible(state,r){
 if(!['appointment','recipe'].includes(r.kind)||state.user?.status!=='active'||state.user?.temporary_password)return false;
 const events=(state.events||[]).filter(e=>canSeeEvent(state.user,state.memberships||[],e)&&(!r.event_id||e.id===r.event_id));
 return state.user.role==='admin'?(!r.event_id||events.length>0):events.some(e=>Date.parse(r.created_at)>=accessSince(state.user,(state.memberships||[]).find(m=>m.mission_id===e.mission_id&&m.active!==false)));
}
export function buildSearchIndex(state,{records=[],resources=[],audit=[],moves=[],legacy=[],paperID=id=>id}={}){
 if(!state?.user||state.user.status!=='active'||state.user.temporary_password)return [];
 const isAdmin=state.user.role==='admin',memberships=state.memberships||[],events=(state.events||[]).filter(e=>canSeeEvent(state.user,memberships,e)),eventMap=new Map(events.map(e=>[e.id,e]));
 const missionIDs=new Set(events.map(e=>e.mission_id)),missions=(state.missions||[]).filter(m=>isAdmin||memberships.some(mm=>mm.mission_id===m.id&&mm.active!==false)),missionMap=new Map(missions.map(m=>[m.id,m]));
 const context=id=>{const e=eventMap.get(id);return e?[missionMap.get(e.mission_id)?.name,e.starts,e.location,e.sample?'Fictional sample':''].filter(Boolean).join(' · '):'All events';};
 const items=[],add=(key,type,title,detail,terms,target)=>items.push({key,type,title:String(title||'Untitled'),detail:String(detail||''),text:searchableText(terms),target});
 for(const [page,title,words,role]of SEARCH_PAGES)if(role!=='admin'||isAdmin)add('page:'+page,'Pages & tools',title,'Open '+title,words,{kind:'page',page});
 for(const sec of GUEST_SECTIONS)for(const g of sec.groups){
  const title=(sec.number?sec.number+'. ':'')+sec.title+(g.title?' · '+g.title:'');
  const choices=g.station==='intake'?[g.fields.includes('health_conditions')?HEALTH_CONDITIONS:[],g.fields.includes('family_history')?FAMILY_HISTORY:[],g.fields.includes('current_symptoms')?SYMPTOMS:[],sec.number===4?LIFESTYLE:[]]:g.fields.includes('systolic')?'BP blood pressure oxygen SpO2':g.fields.includes('sugar')?'blood glucose sugar diabetes fasting':g.fields.includes('cholesterol')?'total cholesterol lipid medicine':g.fields.includes('uric')?'uric acid gout kidney stones':g.station==='urinalysis'?'urine dipstick strips brand leukocytes nitrite protein pH specific gravity ketones blood bilirubin glucose ascorbic acid':g.fields.includes('followup_date')?'follow up follow-up appointment referral':[];
  add('section:'+sec.number+':'+g.station+':'+g.title,'Form sections',title,'Find or enter a guest ID to open this section',[g.fields.map(k=>GUEST_FIELD_LABELS[k]||k.replaceAll('_',' ').replace(/([a-z])([A-Z])/g,'$1 $2')),choices],{kind:'section',station:g.station,section:sec.number});
 }
 for(const m of missions)add('mission:'+m.id,'Events & locations',m.name,[m.kind==='regular'?'Regular visits':'Large event',m.province,m.country].filter(Boolean).join(' · '),[m.name,m.notes,m.location,m.kind,m.province,m.country],{kind:'mission',id:m.id});
 for(const e of events)add('day:'+e.id,'Events & locations',e.name||e.location,context(e.id),[e.name,e.location,e.starts,e.ends,e.approval,e.closed?'closed':'open',e.notes],{kind:'day',id:e.id});
 const visits=new Map();
 for(const r of records){if(!canSeeRecord(state.user,memberships,events,r))continue;const key=r.event_id+'|'+r.guest_id;if(!visits.has(key))visits.set(key,[]);visits.get(key).push(r);}
 for(const [key,rows]of visits){const reg=rows.find(r=>r.station==='registration')?.data||{},eid=rows[0].event_id,gid=rows[0].guest_id,code=paperID(gid,eid);add('visit:'+key,'Guests & records',reg.name||'Guest '+code,code+' · '+context(eid),[code,gid,reg,rows.map(r=>[STATIONS[r.station],r.data])],{kind:'visit',key,eventID:eid,guestID:gid});}
 for(const f of followupAppointments(records,events,paperID))add(f.id,'Appointments',f.name+' · follow-up',f.date+' · '+f.location,[f.name,f.date,f.stations,'follow up appointment upcoming'],{kind:'visit',key:f.visit,eventID:f.event_id,guestID:f.guest_id});
 const seenResources=new Set();for(const r of resources){if(seenResources.has(r.id)||!resourceAccessible(state,r))continue;seenResources.add(r.id);add('resource:'+r.id,r.kind==='recipe'?'Programs & recipes':'Appointments',r.data.name||r.kind,context(r.event_id),r.data,{kind:'resource',id:r.id,resourceKind:r.kind,eventID:r.event_id});}
 const locations=(state.inventory?.locations||[]).filter(l=>isAdmin||memberships.some(m=>m.active!==false&&m.mission_id===l.mission_id)&&(!l.event_id||eventMap.has(l.event_id)));
 const locMap=new Map(locations.map(l=>[l.id,l]));
 for(const l of locations)add('location:'+l.id,'Inventory',l.name,'Stock location',[l.name,l.kind,context(l.event_id)],{kind:'inventory',locationID:l.id});
 for(const [key,item]of Object.entries(SUPPLY_ITEMS))add('supply-type:'+key,'Inventory',item.name,item.reusable?'Reusable dental instrument':'Screening strips',[item.name,item.unit],{kind:'inventory',item:key});
 for(const r of state.supplies||[]){if(!locMap.has(r.data.location_id))continue;const item=SUPPLY_ITEMS[r.data.item];if(!item)continue;const data=isAdmin?r.data:{...r.data,note:''};add('supply:'+r.id,'Inventory',item.name,locMap.get(data.location_id).name+' · '+data.quantity+' '+item.unit,[item.name,data],{kind:'supply',id:r.id,locationID:data.location_id});}
 for(const g of state.grades||[])add('grade:'+g.grade,'Inventory','Glasses +'+g.grade,'Reading glasses grade',[g.grade,'eyeglasses reading spectacles low stock alert',g.low_stock],{kind:'inventory',grade:g.grade});
 const uniqueMoves=new Map([...moves,...(state.inventory?.moves||[])].map(m=>[m.id,m]));
 for(const m of uniqueMoves.values()){
  const from=locMap.get(m.from_location),to=locMap.get(m.to_location);if(!isAdmin&&!from&&!to)continue;
  if(!isAdmin&&!(Date.parse(m.created_at)>=Math.min(...[from,to].filter(Boolean).map(l=>accessSince(state.user,memberships.find(mm=>mm.mission_id===l.mission_id&&mm.active!==false))))))continue;
  const safe=!isAdmin&&(!from||!to)?{...m,from_location:from?.id||null,to_location:to?.id||null,note:'Mission stock movement'}:m;
  add('move:'+m.id,'Stock movements',m.kind+' · +'+m.grade+' · '+m.quantity+' pairs',[from?.name,to?.name,m.created_at?.slice(0,10)].filter(Boolean).join(' → '),[safe,from?.name,to?.name],{kind:'move',id:m.id});
 }
 for(const m of new Map([...legacy,...(state.inventory?.legacy||[])].map(m=>[m.id,m])).values()){if(!eventMap.has(m.event_id))continue;const e=eventMap.get(m.event_id);if(!isAdmin&&!(Date.parse(m.created_at)>=accessSince(state.user,memberships.find(mm=>mm.mission_id===e.mission_id&&mm.active!==false))))continue;add('legacy:'+m.id,'Stock movements','Earlier stock entry · +'+m.grade,context(m.event_id),[m.grade,m.quantity,m.note,m.created_at],{kind:'legacy',id:m.id,eventID:m.event_id});}
 for(const issue of state.inventory?.issues||[]){if(!eventMap.has(issue.event_id)||!locMap.has(issue.location_id))continue;const code=paperID(issue.guest_id,issue.event_id);add('issue:'+issue.event_id+'|'+issue.guest_id,'Stock movements','Glasses dispensed · '+code,context(issue.event_id),[code,issue.grade,issue.quantity],{kind:'visit',key:issue.event_id+'|'+issue.guest_id,eventID:issue.event_id,guestID:issue.guest_id});}
 const people=isAdmin?state.members||[]:(state.roster||[]).filter(p=>(state.teamMemberships||[]).some(mm=>mm.user_id===p.id&&mm.active!==false&&missionMap.has(mm.mission_id)));
 for(const p of people){const trips=(state.teamMemberships||[]).filter(mm=>mm.user_id===p.id&&missionMap.has(mm.mission_id)).map(mm=>missionMap.get(mm.mission_id)?.name);add('person:'+p.id,'Team & attendance',p.name,trips.join(' · ')||'Wellness team',[p.name,p.initials,trips,isAdmin?[p.email,p.role,p.status]:[]],{kind:'person',id:p.id});}
 for(const a of state.attendance||[]){const e=eventMap.get(a.event_id),p=people.find(p=>p.id===a.user_id);if(!e||!p)continue;if(!isAdmin&&!(Date.parse(a.updated_at)>=accessSince(state.user,memberships.find(mm=>mm.mission_id===e.mission_id))))continue;add('attendance:'+a.event_id+'|'+a.user_id,'Team & attendance',p.name+' · '+a.status,context(e.id),[a.status,p.name,e.starts,e.location],{kind:'attendance',eventID:e.id,personID:p.id});}
 if(isAdmin)for(const a of new Map(audit.map(a=>[a.id,a])).values())add('audit:'+a.id,'Edit history',(STATIONS[a.station]||a.station||'Edit')+' · '+(a.guest_id?paperID(a.guest_id,a.event_id):'Event'),context(a.event_id),[a.before_data,a.after_data,a.created_at,a.guest_id],{kind:'audit',id:a.id,eventID:a.event_id});
 for(const q of state.queue||[]){if(!canSeeRecord(state.user,memberships,events,q))continue;add('queue:'+q.id,'Sync & pending',paperID(q.guest_id,q.event_id)+' · '+(STATIONS[q.station]||q.station),context(q.event_id)+' · '+q.status,[q.data,q.error,q.status,'offline pending upload sync'],{kind:'queue',id:q.id,eventID:q.event_id});}
 for(const n of state.reminders||[])if(eventMap.has(n.event_id))add('reminder:'+n.id,'Sync & pending','Team request to sync',context(n.event_id),[n.message,n.created_at,'reminder request sync upload'],{kind:'reminder',id:n.id,eventID:n.event_id});
 return items.map(i=>({...i,normalizedTitle:normalizeSearch(i.title),normalizedText:normalizeSearch([i.title,i.detail,i.text].join(' '))}));
}
export function searchIndex(index,query,{category='',limit=60}={}){
 const q=normalizeSearch(String(query).slice(0,160)),tokens=q.split(' ').filter(Boolean);
 const matches=index.filter(i=>(!category||i.type===category)&&tokens.every(t=>i.normalizedText.includes(t))).map(i=>({item:i,score:!q?i.type==='Pages & tools'?80:0:i.normalizedTitle===q?100:i.normalizedTitle.startsWith(q)?90:i.normalizedTitle.includes(q)?75:tokens.every(t=>i.normalizedTitle.includes(t))?65:25})).sort((a,b)=>b.score-a.score||a.item.title.localeCompare(b.item.title));
 return {total:matches.length,items:matches.slice(0,limit).map(x=>x.item)};
}
