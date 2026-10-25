-- Fictional examples only. Idempotent seed: never replaces an edited sample record.
do $$
declare owner_id uuid; device_id uuid; device_code bigint; e uuid; gid text; base text; digit int; i int; j int; k int; person text;
begin
 select id into owner_id from wellness_members where role='admin' order by id limit 1;
 if owner_id is null then raise exception 'Wellness owner not found'; end if;
 insert into wellness_devices(id,user_id,prefix,label) values('00000000-0000-4000-a000-000000000001',owner_id,'DEMO','Fictional sample namespace') on conflict do nothing;
 select id,code into device_id,device_code from wellness_devices where id='00000000-0000-4000-a000-000000000001';
 for j in 1..3 loop
  e:=('10000000-0000-4000-a000-'||lpad(j::text,12,'0'))::uuid;
  insert into wellness_events(id,mission_id,name,starts,ends,location,country,frequency,notes,sample)
  values(e,'50000000-0000-4000-a000-000000000001',(array['Sample · Community wellness day','Sample · Quarterly reading glasses','Sample · Dental & health outreach'])[j],
    (array['2026-10-01'::date,'2026-10-15'::date,'2026-10-25'::date])[j],(array['2026-10-01'::date,'2026-10-15'::date,'2026-10-25'::date])[j],
    (array['Demo village, Vientiane','Demo community hall','Demo outreach center'])[j],'Laos',(array['One-time','Quarterly','Annual'])[j],'Fictional training event. Do not use for real guests.',true) on conflict do nothing;
  for i in 1..8 loop
   base:='DEMO-'||lpad(device_code::text,4,'0')||'-'||lpad(((j-1)*8+i)::text,6,'0');digit:=0;
   for k in 1..length(base) loop digit:=(digit*31+ascii(substr(base,k,1)))%36;end loop;
   gid:=base||'-'||substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',digit+1,1);
   person:=(array['Mali Phomma','Noy Souvanna','Arun Chai','Lina Keo','Kanya Som','Bounmy Vong','Dara Seng','Somchai Phan'])[i]||' (sample '||j||')';
   if i<>8 then
    insert into wellness_records(event_id,guest_id,station,data,revision,author,device_id) values(e,gid,'registration',jsonb_build_object('name',person,'local',case when i%2=0 then 'ຕົວຢ່າງ' else '' end,'age',(20+i*5)::text,'sex',case when i%2=0 then 'Female' else 'Male' end,'country','Laos','province','Vientiane','village','Demo village '||i,'phone','','language','Lao','consent','yes','notes','Fictional training example.'),gen_random_uuid(),owner_id,device_id) on conflict do nothing;
   end if;
   insert into wellness_records(event_id,guest_id,station,data,revision,author,device_id) values(e,gid,'measurements',jsonb_build_object('height',(150+i*3)::text,'weight',(48+i*4)::text,'notes','Sample measurements'),gen_random_uuid(),owner_id,device_id) on conflict do nothing;
   if i<=6 then
    insert into wellness_records(event_id,guest_id,station,data,revision,author,device_id) values(e,gid,'glasses',jsonb_build_object('grade',(array['+1.00','+1.50','+2.00','+2.50','+3.00','+1.50'])[i],'quantity',case when i=6 then '0' else '1' end,'status',case when i=6 then 'Referred' else 'Provided' end,'notes','Fictional reading glasses service'),gen_random_uuid(),owner_id,device_id) on conflict do nothing;
   end if;
   if i<=5 then
    insert into wellness_records(event_id,guest_id,station,data,revision,author,device_id) values(e,gid,'dental',jsonb_build_object('status',case when i=5 then 'Assessed only' else 'Completed' end,'notes','Fictional dental example'),gen_random_uuid(),owner_id,device_id) on conflict do nothing;
   end if;
   if i<=7 then
    insert into wellness_records(event_id,guest_id,station,data,revision,author,device_id) values(e,gid,'assessment',jsonb_build_object('systolic',(110+i*2)::text,'diastolic',(70+i)::text,'sugar',(85+i*2)::text,'sugarUnit','mg/dL','sugarContext','Random','uric','4.5','uricUnit','mg/dL','symptoms',case when i=2 then 'Guest reports difficulty reading.' else 'No symptoms reported in this fictional example.' end,'diagnoses','','allergies',case when i=3 then 'Peanuts (sample)' else 'None reported (sample)' end,'medications','Not recorded','referral',case when i=6 then 'Yes' else 'No' end,'notes','Example assessment; no automated diagnosis.'),gen_random_uuid(),owner_id,device_id) on conflict do nothing;
   end if;
  end loop;
  for i in 1..3 loop
   insert into wellness_resources(id,kind,event_id,sample,data) values(('20000000-0000-4000-a000-'||lpad((j*10+i)::text,12,'0'))::uuid,'appointment',e,true,jsonb_build_object('name','Sample follow-up guest '||i,'guest_id','','date','2026-10-26','time',(array['09:00','10:30','14:00'])[i],'service',(array['Reading glasses','Dental cleaning','Health assessment'])[i],'status',(array['Scheduled','Completed','Cancelled'])[i],'location','Demo wellness center','notes','Fictional appointment')) on conflict do nothing;
  end loop;
 end loop;
 insert into wellness_audit(id,event_id,guest_id,station,actor,before_data,after_data) values('40000000-0000-4000-a000-000000000001','10000000-0000-4000-a000-000000000001',null,'Sample correction',owner_id,'{"notes":"Fictional original note"}','{"notes":"Fictional corrected note"}') on conflict do nothing;
end $$;
insert into wellness_resources(id,kind,data,sample) values
('30000000-0000-4000-a000-000000000001','recipe','{"name":"Garden green","category":"Juicing","description":"Fictional program recipe for testing batch scaling.","servings":"2","size":"250","ingredients":"Cucumber | 200 | g\nApple | 150 | g\nSpinach | 40 | g\nWater | 100 | ml","instructions":"Wash produce, chop and blend. Serve freshly prepared.","allergens":"Review all ingredients with the guest."}',true),
('30000000-0000-4000-a000-000000000002','recipe','{"name":"Sunshine blend","category":"Juicing","description":"Carrot and orange sample recipe.","servings":"2","size":"250","ingredients":"Carrot | 200 | g\nOrange | 200 | g\nWater | 100 | ml","instructions":"Wash, peel and blend.","allergens":"Citrus. Review all ingredients."}',true),
('30000000-0000-4000-a000-000000000003','recipe','{"name":"Ruby roots","category":"Juicing","description":"Beetroot and apple sample recipe.","servings":"4","size":"250","ingredients":"Beetroot | 200 | g\nApple | 400 | g\nWater | 300 | ml","instructions":"Wash and prepare produce. Blend with water.","allergens":"Review ingredients before serving."}',true),
('30000000-0000-4000-a000-000000000004','recipe','{"name":"Hydration session","category":"Wellness education","description":"Fictional small-group program example.","servings":"10","size":"250","ingredients":"Drinking water | 2500 | ml","instructions":"Use safe drinking water. Adapt to individual clinical guidance.","allergens":"No treatment claims. Check individual needs."}',true)
on conflict do nothing;

-- Additional consultation, waistline and grade-stock examples for the mission model.
update wellness_records r set data=jsonb_set(data,'{grade}',to_jsonb(ltrim(data->>'grade','+'))) from wellness_events e where r.event_id=e.id and e.sample and r.station='glasses' and data->>'grade' like '+%';
insert into wellness_stock(event_id,grade,received) select e.id,g.grade,20 from wellness_events e cross join wellness_grades g where e.sample on conflict do nothing;
insert into wellness_records(event_id,guest_id,station,data,revision,author,device_id)
select r.event_id,r.guest_id,'consultation',jsonb_build_object('reason','Fictional wellness consultation','findings','Sample clinician note','diagnoses','','advice','Follow the clinician’s individual guidance.','referral','No','clinician','Demo clinician','notes','Fictional example only'),gen_random_uuid(),r.author,r.device_id from wellness_records r join wellness_events e on e.id=r.event_id where e.sample and r.station='assessment' and (r.data->>'systolic')::int<=118 on conflict do nothing;
