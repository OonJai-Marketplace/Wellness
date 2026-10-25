create or replace function public.wellness_rate_guard(p_key text,p_limit int) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare n int;
begin
 insert into wellness_rate_limits(key,bucket,attempts) values(p_key,date_trunc('hour',now()),1)
 on conflict(key) do update set attempts=case when wellness_rate_limits.bucket<date_trunc('hour',now()) then 1 else wellness_rate_limits.attempts+1 end,bucket=date_trunc('hour',now()) returning attempts into n;return n<=p_limit;
end $$;
revoke all on function wellness_rate_guard(text,int) from public,anon,authenticated;grant execute on function wellness_rate_guard(text,int) to service_role;

create or replace function public.wellness_apply(p_actor uuid, p_operation jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare m wellness_members; old wellness_records; receipt wellness_receipts; d wellness_devices;
 e wellness_events; trip_admin boolean; opid uuid:=(p_operation->>'id')::uuid; eid uuid:=(p_operation->>'event_id')::uuid;
 gid text:=p_operation->>'guest_id'; st text:=p_operation->>'station'; result jsonb; owner_device bigint;
begin
 select * into m from wellness_members where id=p_actor;
 if not found or m.status<>'active' or m.temporary_password then raise exception 'Access is not active'; end if;
 perform pg_advisory_xact_lock(hashtextextended(opid::text,1));
 select * into receipt from wellness_receipts where id=opid;
 if found then
  if receipt.user_id<>p_actor or receipt.operation<>p_operation then raise exception 'Operation ID already used'; end if;
  return receipt.result;
 end if;
 select * into e from wellness_events where id=eid for update;
 if not found or e.closed or e.approval='approved' then raise exception 'Event is unavailable or closed'; end if;
 trip_admin:=m.role='admin' or exists(select 1 from wellness_mission_members where user_id=p_actor and mission_id=e.mission_id and role='admin');
 if not trip_admin and not exists(select 1 from wellness_mission_members where user_id=p_actor and mission_id=e.mission_id) then raise exception 'Join this mission first';end if;
 if (p_operation->>'captured_at')::timestamptz is null then raise exception 'Capture time required';end if;
 if ((p_operation->>'captured_at')::timestamptz at time zone 'Asia/Vientiane')::date<>e.starts and coalesce((p_operation->>'date_ack')::boolean,false)=false then raise exception 'Date differs from this session. Confirm the date warning.';end if;
 select * into d from wellness_devices where id=(p_operation->>'device_id')::uuid and user_id=p_actor and not retired;
 if not found then raise exception 'Prepare this phone online first'; end if;
 if gid !~ '^[A-Z]{2,5}-[0-9]{4,12}-[0-9]{6,9}-[A-Z0-9]$' then raise exception 'Invalid guest ID'; end if;
 owner_device:=split_part(gid,'-',2)::bigint;
 if not exists(select 1 from wellness_devices where code=owner_device and prefix=split_part(gid,'-',1)) then raise exception 'Unknown registration phone code'; end if;

 perform pg_advisory_xact_lock(hashtextextended(eid::text||gid||st,2));
 select * into old from wellness_records where event_id=eid and guest_id=gid and station=st;
 if found and (not trip_admin or coalesce(p_operation->>'base_revision','')<>old.revision::text) then
  result:=jsonb_build_object('status','conflict','message','This station already has a record. An administrator must review both versions.');
  insert into wellness_receipts(id,user_id,operation,result) values(opid,p_actor,p_operation,result); return result;
 end if;
 if st='registration' and not trip_admin and owner_device<>d.code then raise exception 'Registration ID belongs to another phone'; end if;
 if st='glasses' and not exists(select 1 from wellness_grades where grade=p_operation->'data'->>'grade' and active) then raise exception 'Choose a valid glasses grade';end if;
 if old.revision is null and nullif(p_operation->>'base_revision','') is not null then raise exception 'The record to edit is missing'; end if;
 if old.revision is not null and old.data<>p_operation->'data' then
  insert into wellness_audit(event_id,guest_id,station,actor,before_data,after_data) values(eid,gid,st,p_actor,old.data,p_operation->'data');
 end if;
 insert into wellness_records(event_id,guest_id,station,data,revision,author,device_id)
 values(eid,gid,st,p_operation->'data',opid,p_actor,d.id)
 on conflict(event_id,guest_id,station) do update set data=excluded.data,revision=excluded.revision,updated_at=now();
 result:=jsonb_build_object('status','saved','revision',opid);
 insert into wellness_receipts(id,user_id,operation,result) values(opid,p_actor,p_operation,result);
 return result;
end $$;
revoke all on function public.wellness_apply(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.wellness_apply(uuid,jsonb) to service_role;

