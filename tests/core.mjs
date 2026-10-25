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
