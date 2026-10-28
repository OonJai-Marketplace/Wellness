-- Preserve the first server receipt time so later edits never reveal older records.
alter table public.wellness_records add column created_at timestamptz;
update public.wellness_records r set created_at=least(r.updated_at,coalesce((select min(x.created_at) from public.wellness_receipts x where x.operation->>'event_id'=r.event_id::text and x.operation->>'guest_id'=r.guest_id and x.operation->>'station'=r.station and x.result->>'status'='saved'),r.updated_at));
alter table public.wellness_records alter column created_at set default now(),alter column created_at set not null;
create index wellness_records_created on public.wellness_records(event_id,created_at);
alter table public.wellness_resources add column created_at timestamptz not null default '-infinity';
alter table public.wellness_resources alter column created_at set default now();
alter table public.wellness_mission_members add column active boolean not null default true;

create table public.wellness_attendance(
 event_id uuid not null references public.wellness_events(id),user_id uuid not null references public.wellness_members(id),
 status text not null check(status in ('present','absent','excused')),
 recorded_by uuid not null references public.wellness_members(id),updated_at timestamptz not null default now(),
 primary key(event_id,user_id)
);
create index wellness_attendance_user on public.wellness_attendance(user_id,event_id);
create index wellness_attendance_recorder on public.wellness_attendance(recorded_by);
alter table public.wellness_attendance enable row level security;
revoke all on public.wellness_attendance from public,anon,authenticated;
grant all on public.wellness_attendance to service_role;

create or replace function public.wellness_can_access_day(p_actor uuid,p_event uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from wellness_members m join wellness_events e on e.id=p_event
 where m.id=p_actor and m.status='active' and not m.temporary_password and
 (m.role='admin' or exists(select 1 from wellness_mission_members mm where mm.user_id=m.id and mm.mission_id=e.mission_id and mm.active
 and e.starts >= (greatest(mm.joined_at,m.created_at) at time zone 'Asia/Vientiane')::date)))
$$;

create or replace function public.wellness_member_save(p_actor uuid,p_target uuid,p_role text,p_status text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare old wellness_members; result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('wellness-account-authority',21));
 if not exists(select 1 from wellness_members where id=p_actor and role='admin' and status='active' and not temporary_password) then raise exception 'Administrator required';end if;
 if p_role not in ('admin','volunteer') or p_status not in ('active','pending','disabled') or p_role is null or p_status is null then raise exception 'Choose valid authority and status';end if;
 select * into old from wellness_members where id=p_target for update;
 if not found then raise exception 'Account not found';end if;
 if p_actor=p_target and (p_role<>'admin' or p_status<>'active') then raise exception 'Ask another administrator to change your own authority';end if;
 if old.role='admin' and (p_role<>'admin' or p_status<>'active') and not exists(select 1 from wellness_members where id<>p_target and role='admin' and status='active' and not temporary_password) then raise exception 'Keep at least one active administrator';end if;
 if p_role='admin' and p_status<>'active' then raise exception 'Administrator accounts must be active';end if;
 update wellness_members set role=p_role,status=p_status where id=p_target returning jsonb_build_object('id',id,'role',role,'status',status) into result;
 insert into wellness_audit(station,actor,before_data,after_data) values('Account authority',p_actor,jsonb_build_object('id',old.id,'role',old.role,'status',old.status),result);
 return result;
end $$;

create or replace function public.wellness_team_assign(p_actor uuid,p_mission uuid,p_users uuid[],p_active boolean default true)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare target uuid;
begin
 if not exists(select 1 from wellness_members where id=p_actor and role='admin' and status='active' and not temporary_password) then raise exception 'Administrator required';end if;
 if not exists(select 1 from wellness_missions where id=p_mission) then raise exception 'Choose a mission trip';end if;
 if coalesce(cardinality(p_users),0)<1 or cardinality(p_users)>100 then raise exception 'Choose 1–100 team members';end if;
 foreach target in array p_users loop
  if not exists(select 1 from wellness_members where id=target) then raise exception 'Account not found';end if;
  if p_active then
   insert into wellness_mission_members(mission_id,user_id) values(p_mission,target)
   on conflict(mission_id,user_id) do update set active=true,joined_at=case when wellness_mission_members.active then wellness_mission_members.joined_at else now() end;
  else
   update wellness_mission_members set active=false where mission_id=p_mission and user_id=target;
  end if;
 end loop;
 insert into wellness_audit(station,actor,after_data) values('Mission team',p_actor,jsonb_build_object('mission_id',p_mission,'users',p_users,'active',p_active));
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.wellness_attendance_save(p_actor uuid,p_event uuid,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare row jsonb; mid uuid; target uuid;
begin
 if not exists(select 1 from wellness_members where id=p_actor and role='admin' and status='active' and not temporary_password) then raise exception 'Administrator required';end if;
 select mission_id into mid from wellness_events where id=p_event;
 if mid is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>500 then raise exception 'Choose a valid day and attendance list';end if;
 for row in select value from jsonb_array_elements(p_rows) loop
  target:=(row->>'user_id')::uuid;
  if not exists(select 1 from wellness_mission_members where mission_id=mid and user_id=target and active) then raise exception 'This person is not on the mission team';end if;
  if row->>'status'='unmarked' then delete from wellness_attendance where event_id=p_event and user_id=target;
  elsif row->>'status' in ('present','absent','excused') then
   insert into wellness_attendance(event_id,user_id,status,recorded_by) values(p_event,target,row->>'status',p_actor)
   on conflict(event_id,user_id) do update set status=excluded.status,recorded_by=p_actor,updated_at=now();
  else raise exception 'Choose a valid attendance status';end if;
 end loop;
 insert into wellness_audit(event_id,station,actor,after_data) values(p_event,'Team attendance',p_actor,p_rows);
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.wellness_join(p_actor uuid,p_code text) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare mission uuid;
begin
 if not exists(select 1 from wellness_members where id=p_actor and status<>'disabled' and not temporary_password) then raise exception 'Account unavailable';end if;
 select id into mission from wellness_missions where code=upper(trim(p_code)) and active;
 if mission is null then raise exception 'Mission code not found. Check the code from your team leader.';end if;
 insert into wellness_mission_members(mission_id,user_id) values(mission,p_actor)
 on conflict(mission_id,user_id) do update set active=true,joined_at=case when wellness_mission_members.active then wellness_mission_members.joined_at else now() end;
 update wellness_members set status='active' where id=p_actor;
 return mission;
end $$;
revoke all on function wellness_can_access_day(uuid,uuid),wellness_member_save(uuid,uuid,text,text),wellness_team_assign(uuid,uuid,uuid[],boolean),wellness_attendance_save(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function wellness_can_access_day(uuid,uuid),wellness_member_save(uuid,uuid,text,text),wellness_team_assign(uuid,uuid,uuid[],boolean),wellness_attendance_save(uuid,uuid,jsonb) to service_role;

create or replace function public.wellness_apply(p_actor uuid, p_operation jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare m wellness_members; old wellness_records; receipt wellness_receipts; d wellness_devices;
 e wellness_events; trip_admin boolean; opid uuid:=(p_operation->>'id')::uuid; eid uuid:=(p_operation->>'event_id')::uuid;
 gid text:=p_operation->>'guest_id'; st text:=p_operation->>'station'; result jsonb; owner_device bigint;
begin
 select * into m from wellness_members where id=p_actor;
 if not found or m.status<>'active' or m.temporary_password then raise exception 'Access is not active'; end if;
 if st='glasses' then perform pg_advisory_xact_lock(hashtextextended('wellness-inventory',11));end if;
 perform pg_advisory_xact_lock(hashtextextended(opid::text,1));
 select * into receipt from wellness_receipts where id=opid;
 if found then
  if receipt.user_id<>p_actor or receipt.operation<>p_operation then raise exception 'Operation ID already used'; end if;
  return receipt.result;
 end if;
 select * into e from wellness_events where id=eid for update;
 if not found or e.closed or e.approval='approved' then raise exception 'Event is unavailable or closed'; end if;
 if not wellness_can_access_day(p_actor,eid) then raise exception 'This day is outside your mission access period';end if;
 trip_admin:=m.role='admin';
 if m.role<>'admin' and exists(select 1 from wellness_records r join wellness_mission_members mm on mm.mission_id=e.mission_id and mm.user_id=p_actor where r.event_id=eid and r.guest_id=gid and r.created_at<greatest(mm.joined_at,m.created_at)) then raise exception 'This guest visit predates your team access';end if;
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
 if st='registration' and nullif(p_operation->'data'->>'person_id','') is not null and p_operation->'data'->>'person_id'<>gid and not exists(select 1 from wellness_records r join wellness_events pe on pe.id=r.event_id where r.station='registration' and coalesce(nullif(r.data->>'person_id',''),r.guest_id)=p_operation->'data'->>'person_id' and (m.role='admin' or exists(select 1 from wellness_mission_members mm where mm.mission_id=pe.mission_id and mm.user_id=p_actor and mm.active and wellness_can_access_day(p_actor,pe.id) and r.created_at>=greatest(mm.joined_at,m.created_at)))) then raise exception 'Guest profile is not available to your team. Sync before linking this visit.';end if;
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



create or replace function public.wellness_regular_day(p_actor uuid,p_item jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare mid uuid:=(p_item->>'mission_id')::uuid;d date:=(p_item->>'starts')::date;loc text:=btrim(p_item->>'location');day wellness_events;
begin
 if not exists(select 1 from wellness_members where id=p_actor and status='active' and not temporary_password and (role='admin' or exists(select 1 from wellness_mission_members where mission_id=mid and user_id=p_actor and active and (p_item->>'starts')::date >= (greatest(joined_at,wellness_members.created_at) at time zone 'Asia/Vientiane')::date))) then raise exception 'Join the regular-visit team first';end if;
 if not exists(select 1 from wellness_missions where id=mid and kind='regular' and active) then raise exception 'Regular-visit workspace unavailable';end if;
 if d is null or loc is null or length(loc)<1 or length(loc)>200 then raise exception 'Check date and location';end if;
 perform pg_advisory_xact_lock(hashtextextended(mid::text||d::text||lower(loc),12));
 select * into day from wellness_events where mission_id=mid and starts=d and lower(btrim(location))=lower(loc);
 if not found then insert into wellness_events(id,mission_id,name,starts,ends,location) values((p_item->>'id')::uuid,mid,'Regular visits · '||d,d,d,loc) returning * into day;end if;
 return to_jsonb(day)||jsonb_build_object('kind','regular');
end $$;

do $$ declare t text;begin foreach t in array array['wellness_inventory_locations','wellness_inventory_balances','wellness_inventory_moves'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;

create or replace function public.wellness_ticket_context(p_actor uuid,p_mission uuid,p_device uuid default null,p_after bigint default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare member wellness_members; phone wellness_devices; g record; next_number integer; latest bigint;
begin
 select * into member from wellness_members where id=p_actor and status='active' and not temporary_password;
 if not found then raise exception 'Active team access required';end if;
 if not exists(select 1 from wellness_missions where id=p_mission) then raise exception 'Event not found';end if;
 if member.role<>'admin' and not exists(select 1 from wellness_mission_members where mission_id=p_mission and user_id=p_actor and active) then raise exception 'Join this event first';end if;
 if p_device is not null then
  select * into phone from wellness_devices where id=p_device and user_id=p_actor and not retired;
  if not found then raise exception 'Prepare your own phone first';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('wellness-tickets:'||p_mission::text,0));
 select coalesce(max(last_number),0)+1 into next_number from wellness_ticket_ranges where mission_id=p_mission;
 -- Legacy and old-client records get aliases without changing their identity.
 for g in select distinct r.guest_id from wellness_records r join wellness_events e on e.id=r.event_id
  where e.mission_id=p_mission and not exists(select 1 from wellness_ticket_ranges t where t.mission_id=p_mission and
   (t.legacy_guest_id=r.guest_id or (t.legacy_guest_id is null and split_part(r.guest_id,'-',1)=t.prefix and
    split_part(r.guest_id,'-',2)=lpad(t.device_code::text,greatest(4,length(t.device_code::text)),'0') and
    case when split_part(r.guest_id,'-',3)~'^\d{6,9}$' then split_part(r.guest_id,'-',3)::bigint between 500000000+t.id*500 and 500000000+t.id*500+t.last_number-t.first_number else false end)))
  order by r.guest_id
 loop
  if next_number>259974 then raise exception 'All short guest numbers for this event have been reserved';end if;
  insert into wellness_ticket_ranges(mission_id,first_number,last_number,legacy_guest_id) values(p_mission,next_number,next_number,g.guest_id);
  next_number:=next_number+1;
 end loop;
 if p_device is not null then
  select max(id) into latest from wellness_ticket_ranges where mission_id=p_mission and device_id=p_device;
  -- A retried request for the same predecessor returns the existing allocation.
  if latest is null or latest=p_after then
   if next_number>259974 then raise exception 'All short guest numbers for this event have been reserved';end if;
   insert into wellness_ticket_ranges(mission_id,device_id,prefix,device_code,first_number,last_number)
    values(p_mission,p_device,phone.prefix,phone.code,next_number,least(next_number+499,259974));
  end if;
 end if;
 return jsonb_build_object('ranges',coalesce((select jsonb_agg(to_jsonb(t) order by id) from wellness_ticket_ranges t where mission_id=p_mission),'[]'::jsonb));
end $$;
revoke all on function public.wellness_ticket_context(uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.wellness_ticket_context(uuid,uuid,uuid,bigint) to service_role;


-- Private lookup: never expose Auth's directory to the browser.
create or replace function public.wellness_find_account(p_email text)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',id,'confirmed',email_confirmed_at is not null,'batch',raw_app_meta_data->>'wellness_batch','creator',raw_app_meta_data->>'wellness_provisioned_by')
 from auth.users where lower(email)=lower(p_email) limit 1
$$;
revoke all on function wellness_find_account(text) from public,anon,authenticated;
grant execute on function wellness_find_account(text) to service_role;
