// Paper IDs are event-scoped aliases. Durable record IDs and profile links never change.
import {makeID,normalizeID,validID} from './core.js?v=1.2.0';
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
export function resolvePaperID(value,mission,ranges=[]){const id=normalizeID(value);if(validID(id))return id;const n=ticketNumber(id),r=ranges.find(r=>r.mission_id===mission&&n>=r.first_number&&n<=r.last_number);if(!r)throw Error('Guest ID not found for this event. Check the slip and sync this phone.');return ticketRecordID(r,n-r.first_number);}
export function ticketRemaining(state,mission){return (state.tickets||[]).filter(r=>r.mission_id===mission&&r.device_id===state.device?.id&&!r.legacy_guest_id).reduce((n,r)=>n+Math.max(0,r.last_number-r.first_number+1-(state.ticketUsed?.[r.id]||0)),0);}
export function reserveTicket(state,mission){
 const ranges=(state.tickets||[]).filter(r=>r.mission_id===mission&&r.device_id===state.device?.id&&!r.legacy_guest_id).sort((a,b)=>a.id-b.id);
 const used=state.ticketUsed||={};for(const r of ranges){const offset=used[r.id]||0;if(offset<=r.last_number-r.first_number){used[r.id]=offset+1;return ticketRecordID(r,offset);}}
 throw Error('Connect and prepare this phone to reserve more guest numbers for this event.');
}
