// Keep the phone's selected session inside its selected, authorized mission.
export function resolveContext({missions=[],events=[]}, preferred={}, today='') {
  const available=events.filter(e=>missions.some(m=>m.id===e.mission_id));
  const ranked=list=>[...list].sort((a,b)=>{
    const rank=e=>e.closed?3:e.starts===today?0:e.starts>today?1:2;
    return rank(a)-rank(b)||(rank(a)<2?a.starts.localeCompare(b.starts):b.starts.localeCompare(a.starts))||a.location.localeCompare(b.location);
  });
  const requested=available.find(e=>e.id===preferred.eventID);
  const fallback=ranked(available.filter(e=>!e.sample))[0]||ranked(available)[0];
  const missionID=missions.find(m=>m.id===preferred.missionID)?.id||requested?.mission_id||fallback?.mission_id||missions[0]?.id||'';
  const days=ranked(available.filter(e=>e.mission_id===missionID));
  return {missionID,eventID:days.find(e=>e.id===preferred.eventID)?.id||days[0]?.id||''};
}
