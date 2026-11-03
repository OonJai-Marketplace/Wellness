// Derived from the current record version, including durable offline edits.
// No second appointment write is needed, so retries cannot create duplicates.
export function followupAppointments(records,events,paperID=id=>id){
 const visits=new Map(),result=new Map(),eventMap=new Map(events.map(e=>[e.id,e]));
 for(const r of records){const key=r.event_id+'|'+r.guest_id;if(!visits.has(key))visits.set(key,[]);visits.get(key).push(r);}
 for(const [visit,rows]of visits){const first=rows[0],event=eventMap.get(first.event_id);if(!event)continue;const name=rows.find(r=>r.station==='registration')?.data.name||'Guest '+paperID(first.guest_id,event.id);
  for(const r of rows){const day=r.data?.followup_date;if(!day)continue;const id='followup:'+visit+'|'+day;
   if(!result.has(id))result.set(id,{id,visit,event_id:event.id,guest_id:first.guest_id,name,date:day,location:event.location,stations:[],pending:false});
   const item=result.get(id);item.stations.push(r.station);item.pending||=!!r.pending;
  }
 }
 return [...result.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));
}
export function scheduleTiming(day,today){const delta=Math.round((Date.parse(day+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);return !Number.isFinite(delta)?'':delta<0?'Past date · check outcome':delta===0?'Due today':delta===1?'Tomorrow':delta<=7?'Upcoming · in '+delta+' days':'Scheduled';}
