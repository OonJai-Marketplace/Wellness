export const STATIONS={registration:'Registration',measurements:'Height, weight & BMI',glasses:'Reading glasses',dental:'Dental cleaning',assessment:'Blood tests & assessment',consultation:'Consultation'};
export const FIELDS={
 registration:['name','local','age','sex','phone','country','province','village','address','language','consent','notes'],
 measurements:['height','weight','waist','notes'],
 glasses:['grade','quantity','status','notes'],
 dental:['status','notes'],
 consultation:['reason','findings','diagnoses','advice','referral','clinician','notes'],
 assessment:['systolic','diastolic','sugar','sugarUnit','sugarContext','uric','uricUnit','symptoms','diagnoses','allergies','medications','referral','notes']
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
 const number=(k,min,max,required=false,integer=false)=>{if(!out[k]&&!required)return;const v=Number(out[k]);if(!out[k]||!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isInteger(v)))throw Error('Check '+k+'.');};
 if(station==='registration'){if(!out.name||out.name.length>150)throw Error('Enter the guest name (up to 150 characters).');if(out.consent!=='yes')throw Error('Confirm permission to record the guest’s information.');number('age',0,120,false,true);}
 if(station==='measurements'){number('height',30,250,true);number('weight',1,400,true);number('waist',20,250);}
 if(station==='glasses'){if(!['Provided','Assessed only','Referred'].includes(out.status))throw Error('Choose glasses outcome.');if(out.status==='Provided')number('quantity',1,20,true,true);if(out.status==='Provided'&&!out.grade)throw Error('Record the glasses grade.');if(out.status!=='Provided')out.quantity='0';}
 if(station==='dental'&&!['Completed','Assessed only','Referred','Declined'].includes(out.status))throw Error('Choose dental outcome.');
 if(station==='consultation'&&!out.reason&&!out.findings&&!out.notes)throw Error('Enter consultation details.');
 if(station==='assessment'){if(!['systolic','sugar','uric','symptoms','diagnoses','allergies','medications','notes'].some(k=>out[k]))throw Error('Enter at least one measurement or assessment note.');number('systolic',40,300);number('diastolic',20,200);number('sugar',0.1,1000);number('uric',0.1,1000);if(!!out.systolic!==!!out.diastolic)throw Error('Record both blood pressure numbers.');if(out.sugar&&!['mg/dL','mmol/L'].includes(out.sugarUnit))throw Error('Choose blood sugar units.');if(out.uric&&!['mg/dL','µmol/L'].includes(out.uricUnit))throw Error('Choose uric acid units.');}
 return out;
}
export function mergeRecords(records,queue=[]){const map=new Map(records.map(r=>[`${r.event_id}|${r.guest_id}|${r.station}`,r]));for(const op of queue){if(['conflict','reviewed'].includes(op.status))continue;map.set(`${op.event_id}|${op.guest_id}|${op.station}`,{...op,revision:op.id,pending:true});}return [...map.values()];}
export function summarize(records){const people=new Map();for(const r of records){const key=r.event_id+'|'+r.guest_id;if(!people.has(key))people.set(key,{});people.get(key)[r.station]=r;}
 const rows=[...people.values()];return {guests:new Set(records.map(r=>r.guest_id)).size,visits:rows.length,registrations:rows.filter(p=>p.registration).length,awaiting:rows.filter(p=>!p.registration).length,measurements:rows.filter(p=>p.measurements).length,glasses:rows.reduce((n,p)=>n+(p.glasses?.data.status==='Provided'?Number(p.glasses.data.quantity)||0:0),0),dental:rows.filter(p=>p.dental?.data.status==='Completed').length,assessments:rows.filter(p=>p.assessment).length,consultations:rows.filter(p=>p.consultation).length,glassesPeople:rows.filter(p=>p.glasses?.data.status==='Provided').length,both:rows.filter(p=>p.glasses?.data.status==='Provided'&&p.dental?.data.status==='Completed').length,consultationOnly:rows.filter(p=>p.consultation&&p.glasses?.data.status!=='Provided'&&p.dental?.data.status!=='Completed').length,referrals:rows.filter(p=>p.assessment?.data.referral==='Yes'||p.consultation?.data.referral==='Yes'||p.glasses?.data.status==='Referred'||p.dental?.data.status==='Referred').length};}

export function aggregateDays(days,filter={}){
 const selected=days.filter(d=>(!filter.mission||d.mission_id===filter.mission)&&(!filter.from||d.starts>=filter.from)&&(!filter.to||d.starts<=filter.to)&&(!filter.location||d.location===filter.location));
 const total=summarize([]);for(const d of selected)for(const key of Object.keys(total))total[key]+=Number(d.metrics[key]||0);
 return {days:selected,total};
}
export function pendingDays(queue,known=[],current=''){
 const counts=new Map([...known,current,...queue.map(o=>o.event_id)].filter(Boolean).map(id=>[id,0]));
 for(const op of queue)if(!['conflict','reviewed'].includes(op.status))counts.set(op.event_id,(counts.get(op.event_id)||0)+1);
 return [...counts].map(([event_id,pending])=>({event_id,pending}));
}
