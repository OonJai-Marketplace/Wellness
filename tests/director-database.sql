-- Run against an isolated database with fictional admin and volunteer fixtures.
begin;
do $$
declare owner_id uuid;vol uuid;mid uuid:=gen_random_uuid();eid uuid:=gen_random_uuid();dev uuid:=gen_random_uuid();code bigint;gid text;op jsonb;a jsonb;b jsonb;item_id uuid:=gen_random_uuid();failed boolean;
begin
 select id into owner_id from wellness_members where role='admin' and status='active' limit 1;
 select id into vol from wellness_members where role='volunteer' and status='active' limit 1;
 if owner_id is null or vol is null then raise exception 'Fictional test members required';end if;
 perform wellness_admin_save(owner_id,'mission',jsonb_build_object('id',mid,'name','QA director test','code','QA-'||upper(mid::text),'active',true,'notes','Isolated test'));
 insert into wellness_mission_members(mission_id,user_id,joined_at) values(mid,vol,now()-interval '1 day');
 insert into wellness_events(id,mission_id,name,starts,ends,location) values(eid,mid,'QA day',current_date,current_date,'QA location');
 insert into wellness_devices(id,user_id,prefix,label) values(dev,vol,'QA','Fictional phone') returning wellness_devices.code into code;
 gid:='QA-'||lpad(code::text,4,'0')||'-000001-X';
 op:=jsonb_build_object('id',gen_random_uuid(),'event_id',eid,'device_id',dev,'guest_id',gid,'station','intake','data',jsonb_build_object('health_conditions','None of the above'),'captured_at',now(),'date_ack',true);
 perform wellness_apply(vol,op);
 perform wellness_apply(vol,op||jsonb_build_object('id',gen_random_uuid(),'station','urinalysis','data',jsonb_build_object('strip_brand','Fictional','tested_at','2026-11-03T08:00','nitrite','Negative')));
 perform wellness_apply(vol,op||jsonb_build_object('id',gen_random_uuid(),'station','assessment','data',jsonb_build_object('cholesterol','5.2','cholesterolUnit','mmol/L')));
 perform wellness_apply(vol,op||jsonb_build_object('id',gen_random_uuid(),'station','glasses','data',jsonb_build_object('status','Not dispensed','grade','','quantity','0')));
 if (select count(*) from wellness_records where event_id=eid)<>4 then raise exception 'New stations were not persisted';end if;
 if (select data->>'cholesterolUnit' from wellness_records where event_id=eid and station='assessment')<>'mmol/L' then raise exception 'Units were lost';end if;
 perform wellness_apply(vol,op||jsonb_build_object('id',gen_random_uuid(),'station','consultation','data',jsonb_build_object('followup_date','2026-11-05')));
 if not exists(select 1 from wellness_records where event_id=eid and station='consultation' and data->>'followup_date'='2026-11-05') then raise exception 'Date-only follow-up was not stored';end if;
 a:=jsonb_build_object('id',item_id,'kind','supply','event_id',eid,'data',jsonb_build_object('item','glucose_strips','location_id','day:'||eid,'quantity','20','note','Fictional count'));
 b:=wellness_admin_save(owner_id,'resource',a);
 failed:=false;begin perform wellness_admin_save(vol,'resource',a);exception when others then failed:=true;end;if not failed then raise exception 'Volunteer changed stock';end if;
 failed:=false;begin perform wellness_admin_save(owner_id,'resource',a);exception when others then failed:=true;end;if not failed then raise exception 'Stale stock update accepted';end if;
 perform wellness_admin_save(owner_id,'resource',a||jsonb_build_object('revision',b->>'revision','data',(a->'data')||jsonb_build_object('quantity','15','note','Recount')));
 if not exists(select 1 from wellness_audit where event_id=eid and station='supply') then raise exception 'Stock correction audit missing';end if;
 failed:=false;begin perform wellness_admin_save(owner_id,'resource',a||jsonb_build_object('id',gen_random_uuid()));exception when others then failed:=true;end;if not failed then raise exception 'Duplicate supply count accepted';end if;
 if not (select relrowsecurity from pg_class where oid='public.wellness_resources'::regclass) then raise exception 'Supply storage is not protected by RLS';end if;
end $$;
rollback;
