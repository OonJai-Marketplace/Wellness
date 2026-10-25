import assert from 'node:assert/strict';
import {makeID,validID,normalizeID,bmi,mergeRecords,summarize,validateData,strongPassword} from '../core.js';
const ids=new Set();for(let phone=1;phone<=100;phone++)for(let n=1;n<=100;n++){const id=makeID('SC',phone,n);assert(validID(id));assert(!ids.has(id));ids.add(id);assert(!validID(id.slice(0,-1)+(id.endsWith('X')?'Y':'X')));}
assert.equal(normalizeID(' sc-0001-000001-a '),'SC-0001-000001-A');assert.equal(bmi({height:'170',weight:'68'}),'23.5');
const m={event_id:'e',guest_id:'g',station:'measurements',data:{height:'170',weight:'68'}};
assert.equal(summarize([m]).awaiting,1);const r={event_id:'e',guest_id:'g',station:'registration',data:{name:'Example'}};assert.equal(summarize(mergeRecords([m],[r])).awaiting,0);
assert.equal(mergeRecords([m],[{...m,id:'new',data:{weight:'70'}}]).length,1);assert.equal(mergeRecords([m],[{...m,status:'conflict',data:{weight:'70'}}])[0].data.weight,'68');
assert.throws(()=>validateData('registration',{name:'Sample'}));assert.throws(()=>validateData('measurements',{height:'0',weight:'68'}));assert.throws(()=>validateData('assessment',{systolic:'120'}));assert.throws(()=>validateData('dental',{status:'Completed',role:'admin'}));assert.equal(validateData('glasses',{status:'Assessed only',quantity:'1'}).quantity,'0');
assert(strongPassword('Temporary!Test2026'));assert(!strongPassword('volunteer@example.com'));
console.log('PASS: 10,000 unique guest IDs, checksums, BMI, out-of-order projection, conflicts, field validation, password policy');
const {aggregateDays,pendingDays}=await import('../core.js');
assert.equal(validateData('glasses',{status:'Assessed only',quantity:'0'}).quantity,'0');
assert.throws(()=>validateData('assessment',{sugarUnit:'mg/dL',referral:'No'}));
assert.equal(summarize([r,{...r,event_id:'other'}]).visits,2);
const metrics=summarize([r]);const days=[{id:'a',mission_id:'m',starts:'2027-03-22',location:'A',metrics},{id:'b',mission_id:'m',starts:'2027-03-23',location:'A',metrics},{id:'c',mission_id:'other',starts:'2027-03-22',location:'B',metrics}];
assert.equal(aggregateDays(days,{mission:'m',from:'2027-03-23'}).total.registrations,1);assert.equal(aggregateDays(days,{location:'A'}).total.visits,2);assert.equal(aggregateDays(days,{from:'2027-03-23',to:'2027-03-22'}).days.length,0);
assert.deepEqual(pendingDays([{event_id:'a',status:'pending'},{event_id:'a',status:'error'},{event_id:'b',status:'conflict'}],['previous'],'b'),[{event_id:'previous',pending:0},{event_id:'b',pending:0},{event_id:'a',pending:2}]);
console.log('PASS: assessment validation, zero issued glasses, separate daily visits, combined report filters, and pending counts across all worked sessions');
