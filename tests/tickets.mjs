import assert from 'node:assert/strict';
import {ticketLabel,ticketNumber,ticketRecordID,paperID,resolvePaperID,reserveTicket,ticketRemaining} from '../tickets.js';
import {validID} from '../core.js';
const range=(id,mission,device,start)=>({id,mission_id:mission,device_id:device,prefix:'QA',device_code:device==='one'?1:2,first_number:start,last_number:start+499});
const a=range(1,'event-a','one',1),b=range(2,'event-a','two',501),c=range(3,'event-b','one',1);
const ranges=[a,b,c],state={device:{id:'one'},tickets:ranges};
const ids=new Set(),papers=new Set();for(let i=0;i<500;i++){const id=reserveTicket(state,'event-a');assert(validID(id));assert(!ids.has(id));ids.add(id);const short=paperID(id,'event-a',ranges);assert.match(short,/^[A-Z]\d{4}$/);assert(!papers.has(short));papers.add(short);assert.equal(resolvePaperID(short,'event-a',ranges),id);}
assert.equal(ticketRemaining(state,'event-a'),0);assert.throws(()=>reserveTicket(state,'event-a'));
assert.notEqual(resolvePaperID('A0001','event-a',ranges),resolvePaperID('A0001','event-b',ranges),'Same paper number in different events never merges identities');
assert.equal(paperID(ticketRecordID(b,0),'event-a',ranges),'A0501');
assert.equal(ticketLabel(9999),'A9999');assert.equal(ticketLabel(10000),'B0001');assert.equal(ticketLabel(259974),'Z9999');assert.equal(ticketNumber(' b0001 '),10000);assert.throws(()=>ticketLabel(259975));assert.equal(ticketNumber('A0000'),0);
assert.throws(()=>resolvePaperID('Z9999','event-a',ranges));assert.throws(()=>resolvePaperID('A0000','event-a',ranges));
const legacy={id:4,mission_id:'event-a',first_number:1001,last_number:1001,legacy_guest_id:ticketRecordID(c,10)};ranges.push(legacy);assert.equal(paperID(legacy.legacy_guest_id,'event-a',ranges),'A1001');assert.equal(resolvePaperID('A1001','event-a',ranges),legacy.legacy_guest_id);
console.log('PASS: short paper IDs, 500 offline reservations, separate device ranges, event isolation, legacy aliases, rollover, exhaustion and invalid input.');
