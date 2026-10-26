export const STATIONS={registration:'Registration',measurements:'Height, weight & BMI',glasses:'Reading glasses',dental:'Dental cleaning',assessment:'Blood tests & assessment',consultation:'Consultation',programs:'Wellness activities'};
export const FIELDS={
 registration:['name','local','age','sex','phone','country','province','village','address','language','consent','notes','person_id'],
 measurements:['height','weight','waist','notes','record_status'],
 glasses:['grade','quantity','status','notes'],
 dental:['status','notes'],
 consultation:['reason','findings','diagnoses','advice','referral','clinician','notes','followup_date','record_status'],
 assessment:['systolic','diastolic','sugar','sugarUnit','sugarContext','uric','uricUnit','symptoms','diagnoses','allergies','medications','referral','notes','conditions','followup_date','record_status'],
 programs:['education','juicing','detox','other','other_status','notes','record_status']
};
export function normalizeID(id){return String(id).trim().toUpperCase().replace(/\s+/g,'');}
export function checkDigit(base){let n=0;for(const c of base)n=(n*31+c.charCodeAt(0))%36;return n.toString(36).toUpperCase();}
export function makeID(prefix,code,sequence){const b=`${prefix}-${String(code).padStart(4,'0')}-${String(sequence).padStart(6,'0')}`;return `${b}-${checkDigit(b)}`;}
export function validID(id){return /^[A-Z]{2,5}-\d{4,12}-\d{6,9}-[A-Z0-9]$/.test(id)&&checkDigit(id.slice(0,-2))===id.slice(-1);}
export function strongPassword(p){return p.length>=12&&p.length<=128&&p===p.trim()&&/\p{Lu}/u.test(p)&&/\p{Ll}/u.test(p)&&/\p{N}/u.test(p)&&/[^\p{L}\p{N}\s]/u.test(p);}
export function bmi(data){return +data.height>0&&+data.weight>0?(+data.weight/((+data.height/100)**2)).toFixed(1):'';}
export function validateData(station,data){
 if(!FIELDS[station]||!data||Array.isArray(data)||typeof data!=='object')throw Error('Invalid station record.');
 const out={}; for(const [k,v] of Object.entries(data)){if(!FIELDS[station].includes(k))throw Error('Unsupported field: '+k);if(typeof v!=='string'||v.length>4000)throw Error('Field is too long: '+k);out[k]=v.trim();}
 if(out.person_id&&!validID(out.person_id))throw Error('Choose a valid guest profile.');
 if(out.followup_date&&!/^\d{4}-\d{2}-\d{2}$/.test(out.followup_date))throw Error('Check the follow-up date.');
 if(out.record_status&&!['Completed','Waiting','Not required','Referred'].includes(out.record_status))throw Error('Choose a valid service status.');
 if(out.record_status&&out.record_status!=='Completed')return {record_status:out.record_status,...(out.notes?{notes:out.notes}:{}),...(out.followup_date?{followup_date:out.followup_date}:{})};
 const number=(k,min,max,required=false,integer=false)=>{if(!out[k]&&!required)return;const v=Number(out[k]);if(!out[k]||!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isInteger(v)))throw Error('Check '+k+'.');};
 if(station==='registration'){if(!out.name||out.name.length>150)throw Error('Enter the guest name (up to 150 characters).');if(out.consent!=='yes')throw Error('Confirm permission to record the guest’s information.');number('age',0,120,false,true);}
 if(station==='measurements'){number('height',30,250,true);number('weight',1,400,true);number('waist',20,250);}
 if(station==='glasses'){if(!['Provided','Assessed only','Referred','Waiting','Not required'].includes(out.status))throw Error('Choose glasses outcome.');if(out.status==='Provided')number('quantity',1,20,true,true);if(out.status==='Provided'&&!out.grade)throw Error('Record the glasses grade.');if(out.status!=='Provided')out.quantity='0';}
 if(station==='dental'&&!['Completed','Assessed only','Referred','Declined','Waiting','Not required'].includes(out.status))throw Error('Choose dental outcome.');
 if(station==='consultation'&&!out.reason&&!out.findings&&!out.notes)throw Error('Enter consultation details.');
 if(station==='assessment'){if(!['systolic','sugar','uric','symptoms','diagnoses','allergies','medications','notes'].some(k=>out[k]))throw Error('Enter at least one measurement or assessment note.');number('systolic',40,300);number('diastolic',20,200);number('sugar',0.1,1000);number('uric',0.1,1000);if(!!out.systolic!==!!out.diastolic)throw Error('Record both blood pressure numbers.');if(out.sugar&&!['mg/dL','mmol/L'].includes(out.sugarUnit))throw Error('Choose blood sugar units.');if(out.uric&&!['mg/dL','µmol/L'].includes(out.uricUnit))throw Error('Choose uric acid units.');}
 if(station==='programs'){for(const k of ['education','juicing','detox','other_status'])if(out[k]&&!['Completed','Waiting','Not required','Referred'].includes(out[k]))throw Error('Choose a valid activity status.');if(!['education','juicing','detox','other_status'].some(k=>out[k]==='Completed'))throw Error('Choose at least one completed activity.');if(out.other_status==='Completed'&&!out.other)throw Error('Name the other activity.');}
 return out;
}
export function mergeRecords(records,queue=[]){const map=new Map(records.map(r=>[`${r.event_id}|${r.guest_id}|${r.station}`,r]));for(const op of queue){if(['conflict','reviewed'].includes(op.status))continue;map.set(`${op.event_id}|${op.guest_id}|${op.station}`,{...op,revision:op.id,pending:true});}return [...map.values()];}
export function recordStatus(r){if(!r)return 'Waiting';return r.data.record_status||r.data.status||(r.station==='registration'?'Registered':'Completed');}
export function personKey(registration){return registration?.data.person_id||registration?.guest_id||'';}
export function summarize(records){
 const people=new Map();for(const r of records){const key=r.event_id+'|'+r.guest_id;if(!people.has(key))people.set(key,{});people.get(key)[r.station]=r;}
 const rows=[...people.values()],done=r=>!!r&&(!r.data.record_status||r.data.record_status==='Completed');
 const ids=[...new Set(rows.filter(p=>p.registration).map(p=>personKey(p.registration)))];
 const out={guests:ids.length,personKeys:ids,visits:rows.length,registrations:rows.filter(p=>p.registration).length,awaiting:rows.filter(p=>!p.registration).length,
 measurements:rows.filter(p=>done(p.measurements)).length,glasses:rows.reduce((n,p)=>n+(p.glasses?.data.status==='Provided'?Number(p.glasses.data.quantity)||0:0),0),
 dental:rows.filter(p=>p.dental?.data.status==='Completed').length,assessments:rows.filter(p=>done(p.assessment)).length,consultations:rows.filter(p=>done(p.consultation)).length,
 glassesPeople:rows.filter(p=>p.glasses?.data.status==='Provided').length,both:rows.filter(p=>p.glasses?.data.status==='Provided'&&p.dental?.data.status==='Completed').length,
 consultationOnly:rows.filter(p=>done(p.consultation)&&p.glasses?.data.status!=='Provided'&&p.dental?.data.status!=='Completed').length,
 referrals:rows.filter(p=>Object.values(p).some(r=>r.data.referral==='Yes'||recordStatus(r)==='Referred')).length,
 bp:rows.filter(p=>done(p.assessment)&&Number(p.assessment.data.systolic)>0&&Number(p.assessment.data.diastolic)>0).length,
 sugar:rows.filter(p=>done(p.assessment)&&Number(p.assessment.data.sugar)>0).length,uric:rows.filter(p=>done(p.assessment)&&Number(p.assessment.data.uric)>0).length,
 education:rows.filter(p=>done(p.programs)&&p.programs.data.education==='Completed').length,
 juicing:rows.filter(p=>done(p.programs)&&p.programs.data.juicing==='Completed').length,detox:rows.filter(p=>done(p.programs)&&p.programs.data.detox==='Completed').length,
 otherActivities:rows.filter(p=>done(p.programs)&&p.programs.data.other_status==='Completed').length,
 followups:rows.filter(p=>Object.values(p).some(r=>r.data.followup_date)).length};
 out.activities=out.education+out.juicing+out.detox+out.otherActivities;
 out.services=out.measurements+out.glassesPeople+out.dental+out.assessments+out.consultations+out.activities;
 out.servedKeys=[...new Set(rows.filter(p=>p.registration&&(done(p.measurements)||done(p.assessment)||done(p.consultation)||p.glasses?.data.status==='Provided'||p.dental?.data.status==='Completed'||done(p.programs))).map(p=>personKey(p.registration)))];
 out.served=out.servedKeys.length;return out;
}
export function aggregateDays(days,filter={}){
 const selected=days.filter(d=>(!filter.mission||d.mission_id===filter.mission)&&(!filter.from||d.starts>=filter.from)&&(!filter.to||d.starts<=filter.to)&&(!filter.location||d.location===filter.location)&&(!filter.kind||filter.kind==='all'||(d.kind||'large')===filter.kind));
 const total=summarize([]);for(const d of selected)for(const key of Object.keys(total))if(typeof total[key]==='number')total[key]+=Number(d.metrics[key]||0);
 total.personKeys=[...new Set(selected.flatMap(d=>d.metrics.personKeys||[]))];total.guests=total.personKeys.length;
 total.servedKeys=[...new Set(selected.flatMap(d=>d.metrics.servedKeys||[]))];total.served=total.servedKeys.length;
 return {days:selected,total};
}
export async function regularDayID(mission,day,location){
 const input=[mission,day,location.trim().toLowerCase().replace(/\s+/g,' ')].join('|');
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input)));bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
 const h=Array.from(bytes.slice(0,16),n=>n.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export function stockLocation(event){return event?.kind==='regular'?'regular:'+event.mission_id:'day:'+event?.id;}
export function profileDirectory(registrations){
 const map=new Map();for(const r of registrations){const id=personKey(r);if(!id)continue;const p=map.get(id)||{id,visits:[],data:{},updated_at:''};p.visits.push({event_id:r.event_id,guest_id:r.guest_id});if(!p.updated_at||(r.updated_at||r.created_at||'')>=p.updated_at){p.data=r.data;p.updated_at=r.updated_at||r.created_at||'';}map.set(id,p);}return [...map.values()];
}

export function pendingDays(queue,known=[],current=''){
 const counts=new Map([...known,current,...queue.map(o=>o.event_id)].filter(Boolean).map(id=>[id,0]));
 for(const op of queue)if(!['conflict','reviewed'].includes(op.status))counts.set(op.event_id,(counts.get(op.event_id)||0)+1);
 return [...counts].map(([event_id,pending])=>({event_id,pending}));
}
