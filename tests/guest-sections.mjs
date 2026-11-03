import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {GUEST_SECTIONS,GUEST_FIELD_LABELS} from '../guest-sections.js';
import {FIELDS,STATIONS,bmi,recordStatus} from '../core.js';

assert.deepEqual(GUEST_SECTIONS.map(s=>s.number),[1,2,3,4,5,6,7,8,9,10,null]);
for(const [station,fields] of Object.entries(FIELDS)){
 const visible=GUEST_SECTIONS.flatMap(s=>s.groups.filter(g=>g.station===station).flatMap(g=>g.fields));
 assert.equal(visible.length,new Set(visible).size,station+' fields must appear only once');
 for(const key of fields.filter(k=>!['person_id','consent','address','record_status'].includes(k)))assert(visible.includes(key),station+'.'+key+' must remain visible');
}
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const renderer=source.slice(source.indexOf('function groupedGuestSections('),source.indexOf('function guestDetail('));
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const ctx=vm.createContext({GUEST_SECTIONS,STATIONS,bmi,recordStatus,esc,fieldLabel:k=>GUEST_FIELD_LABELS[k]||k,state:{members:[],roster:[]},ev:()=>({closed:false}),admin:()=>true,validID:()=>true,button:(action,label,id)=>`<button data-action="${action}" data-id="${id}">${label}</button>`});
vm.runInContext(renderer,ctx);
const row=Object.fromEntries(Object.entries({
 registration:{name:'<script>Fictional guest</script>',occupation:'Teacher'},
 intake:{health_conditions:'High blood pressure',family_history:'Diabetes',current_symptoms:'None',eating_pattern:'Balanced and varied'},
 measurements:{height:'160',weight:'60'},
 assessment:{systolic:'120',diastolic:'80',sugar:'100',sugarUnit:'mg/dL',cholesterol:'5.2',cholesterolUnit:'mmol/L',uric:'300',uricUnit:'µmol/L',conditions:'Retained legacy condition'},
 glasses:{status:'Provided',quantity:'1',grade:'1.00'}
}).map(([station,data])=>[station,{station,data}]));
const html=ctx.groupedGuestSections(row,{interactive:true,guestID:'A0001'});
const section=n=>html.split(`data-guest-section="${n}">`)[1].split('</section>')[0];
assert.match(section(1),/&lt;script&gt;Fictional guest&lt;\/script&gt;/);
assert.match(section(2),/A\. Existing health conditions/);assert.match(section(2),/B\. Family History/);assert(!section(2).includes('Balanced and varied'));
assert.match(section(3),/None/);assert.match(section(4),/Balanced and varied/);
assert.match(section(5),/Anthropometric measurements/);assert.match(section(5),/Vital signs/);assert.match(section(5),/23.4/);assert.match(section(5),/>120</);assert(!section(5).includes('5.2'));
assert(section(6).indexOf('Blood glucose')<section(6).indexOf('Total cholesterol'));assert(section(6).indexOf('Total cholesterol')<section(6).indexOf('Uric acid'));assert.match(section(6),/Retained legacy condition/);
assert.match(section(7),/Not recorded/);assert.match(section(8),/Dispensed/);
assert.match(section(3),/A0001\|intake\|3/);assert.match(section(5),/A0001\|assessment\|5/);assert.match(section(6),/A0001\|assessment\|6/);
row.intake.pending=true;assert(!ctx.groupedGuestSections(row,{interactive:true,guestID:'A0001'}).includes('A0001|intake|'));
const printed=ctx.groupedGuestSections(row,{print:true});assert(!printed.includes('<button'));assert.match(printed,/data-guest-section="10"/);
const history=ctx.groupedGuestSections({assessment:row.assessment},{hideMissing:true});assert(!history.includes('data-guest-section="1"'));assert.match(history,/data-guest-section="5"/);assert.match(history,/data-guest-section="6"/);
console.log('PASS: ordered guest sections, field retention, medical/family/symptom/lifestyle separation, combined measurements/vitals, blood subgroups, legacy data, escaped values, section actions, pending protections and print/history groups.');
