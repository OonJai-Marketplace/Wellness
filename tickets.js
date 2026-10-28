// Paper IDs are event-scoped aliases. Durable record IDs and profile links never change.
import {makeID,normalizeID,validID} from './core.js?v=1.3.3';
const SIZE=500,BASE=500000000,MAX=26*9999;
export function ticketLabel(n){if(!Number.isInteger(n)||n<1||n>MAX)throw Error('Guest number is out of range.');return String.fromCharCode(65+Math.floor((n-1)/9999))+String((n-1)%9999+1).padStart(4,'0');}
export function ticketNumber(value){const id=normalizeID(value);return /^[A-Z]\d{4}$/.test(id)&&Number(id.slice(1))>0?(id.charCodeAt(0)-65)*9999+Number(id.slice(1)):0;}
export function ticketRecordID(range,offset){if(!Number.isInteger(offset)||offset<0||offset>range.last_number-range.first_number)throw Error('Guest number is outside the reserved range.');return range.legacy_guest_id||makeID(range.prefix,range.device_code,BASE+Number(range.id)*SIZE+offset);}
export function paperID(id,mission,ranges=[]){
 const parts=String(id).split('-'),seq=Number(parts[2]);
 for(const r of ranges.filter(r=>r.mission_id===mission)){
  if(r.legacy_guest_id===id)return ticketLabel(r.first_number);
  const offset=seq-BASE-Number(r.id)*SIZE;
  if(!r.legacy_guest_id&&parts[0]===r.prefix&&Number(parts[1])===Number(r.device_code)&&offset>=0&&offset<=r.last_number-r.first_number)return ticketLabel(r.first_number+offset);
 }return id;
}
export function validGuestID(value){const id=normalizeID(value);return validID(id)||ticketNumber(id)>0;}
// Opening a station never needs a downloaded range or registration record.
// Keep an unknown paper ID as a local reference until its event mapping arrives.
export function stationGuestID(value,mission,ranges=[]){
 const id=normalizeID(value);if(validID(id))return id;
 const n=ticketNumber(id);if(!n)throw Error('Enter the guest ID from the slip, for example A0001.');
 const r=ranges.find(r=>r.mission_id===mission&&n>=r.first_number&&n<=r.last_number);
 return r?ticketRecordID(r,n-r.first_number):id;
}
export function resolvePaperID(value,mission,ranges=[]){const id=stationGuestID(value,mission,ranges);if(!validID(id))throw Error('This paper ID has not been issued in this event. Check the slip, event and day. The entry remains saved on this phone.');return id;}
export function linkPendingTickets(state){
 for(const q of state.queue||[]){
  if(validID(q.guest_id))continue;
  const mission=state.events.find(e=>e.id===q.event_id)?.mission_id;if(!mission)continue;
  const id=stationGuestID(q.guest_id,mission,state.tickets||[]);
  if(validID(id)){q.guest_id=id;if(q.ticket_pending){delete q.ticket_pending;delete q.error;q.status='pending';}}
 }
}
export function ticketRemaining(state,mission){return (state.tickets||[]).filter(r=>r.mission_id===mission&&r.device_id===state.device?.id&&!r.legacy_guest_id).reduce((n,r)=>n+Math.max(0,r.last_number-r.first_number+1-(state.ticketUsed?.[r.id]||0)),0);}
export function reserveTicket(state,mission){
 const ranges=(state.tickets||[]).filter(r=>r.mission_id===mission&&r.device_id===state.device?.id&&!r.legacy_guest_id).sort((a,b)=>a.id-b.id);
 const used=state.ticketUsed||={};for(const r of ranges){const offset=used[r.id]||0;if(offset<=r.last_number-r.first_number){used[r.id]=offset+1;return ticketRecordID(r,offset);}}
 throw Error('Connect inside this event to download more guest numbers for registration. Other stations can continue offline.');
}
