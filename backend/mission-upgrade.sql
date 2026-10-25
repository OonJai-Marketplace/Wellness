create table public.wellness_missions (
 id uuid primary key, name text not null, code text not null unique check(code ~ '^[A-Z0-9][A-Z0-9 -]{3,49}$'),
 notes text not null default '', sample boolean not null default false, active boolean not null default true, created_at timestamptz not null default now()
);
create table public.wellness_mission_members (
 mission_id uuid references wellness_missions(id), user_id uuid references wellness_members(id),
 role text not null default 'volunteer' check(role in ('volunteer','admin')),joined_at timestamptz not null default now(),primary key(mission_id,user_id)
);
create index wellness_mission_members_user on wellness_mission_members(user_id);
alter table public.wellness_events add column mission_id uuid references wellness_missions(id),add column approval text not null default 'draft' check(approval in ('draft','approved')),add column approved_at timestamptz,add column approved_by uuid references wellness_members(id);
create index wellness_events_mission on wellness_events(mission_id);
create index wellness_events_approved_by on wellness_events(approved_by);
insert into wellness_missions(id,name,code,notes,sample) values('50000000-0000-4000-a000-000000000001','Sample · October outreach','DEMO-2026','Fictional mission for testing every station.',true);
update wellness_events set mission_id='50000000-0000-4000-a000-000000000001' where sample;
alter table wellness_events add constraint wellness_one_day check(starts=ends);
alter table wellness_records drop constraint wellness_records_station_check;
alter table wellness_records add constraint wellness_records_station_check check(station in ('registration','measurements','glasses','dental','assessment','consultation'));
create table public.wellness_grades(grade text primary key, active boolean not null default true);
insert into wellness_grades(grade) select to_char(n/100.0,'FM0.00') from generate_series(100,500,25) n;
create table public.wellness_stock (
 event_id uuid references wellness_events(id), grade text references wellness_grades(grade), received int not null default 0 check(received>=0),
 primary key(event_id,grade)
);
create table public.wellness_stock_log (
 id uuid primary key, event_id uuid references wellness_events(id), grade text references wellness_grades(grade), quantity int not null,
 actor uuid references wellness_members(id),note text not null,created_at timestamptz not null default now()
);
create index wellness_stock_log_event on wellness_stock_log(event_id);
create index wellness_stock_log_grade on wellness_stock_log(grade);
create index wellness_stock_log_actor on wellness_stock_log(actor);
create table public.wellness_device_status (
 event_id uuid references wellness_events(id),device_id uuid references wellness_devices(id),user_id uuid references wellness_members(id),
 pending int not null,last_seen timestamptz not null default now(),primary key(event_id,device_id)
);
create index wellness_device_status_device on wellness_device_status(device_id);
create index wellness_device_status_user on wellness_device_status(user_id);
do $$ declare t text; begin foreach t in array array['wellness_missions','wellness_mission_members','wellness_grades','wellness_stock','wellness_stock_log','wellness_device_status'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon, authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;

-- Joining a shared code grants all stations for every day/location in that mission.
create or replace function public.wellness_join(p_actor uuid,p_code text) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare mission uuid;
begin
 if not exists(select 1 from wellness_members where id=p_actor and status<>'disabled' and not temporary_password) then raise exception 'Account unavailable';end if;
 select id into mission from wellness_missions where code=upper(trim(p_code)) and active;
 if mission is null then raise exception 'Mission code not found. Check the code from your team leader.';end if;
 insert into wellness_mission_members(mission_id,user_id) values(mission,p_actor) on conflict do nothing;
 update wellness_members set status='active' where id=p_actor;
 return mission;
end $$;
revoke all on function wellness_join(uuid,text) from public,anon,authenticated;grant execute on function wellness_join(uuid,text) to service_role;

create or replace function public.wellness_stock_add(p_actor uuid,p_id uuid,p_event uuid,p_grade text,p_quantity int,p_note text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from wellness_members m where m.id=p_actor and m.status='active' and (m.role='admin' or exists(select 1 from wellness_mission_members mm join wellness_events e on e.mission_id=mm.mission_id where mm.user_id=m.id and mm.role='admin' and e.id=p_event))) then raise exception 'Administrator required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,3));
 if exists(select 1 from wellness_stock_log where id=p_id) then return jsonb_build_object('status','saved');end if;
 if p_quantity=0 or length(trim(p_note))<3 then raise exception 'Enter a stock quantity and explanation';end if;
 if exists(select 1 from wellness_events where id=p_event and approval='approved') then raise exception 'Reopen this day before changing its stock';end if;
 insert into wellness_stock(event_id,grade,received) values(p_event,p_grade,p_quantity) on conflict(event_id,grade) do update set received=wellness_stock.received+excluded.received;
 insert into wellness_stock_log(id,event_id,grade,quantity,actor,note) values(p_id,p_event,p_grade,p_quantity,p_actor,p_note);
 return jsonb_build_object('status','saved');
end $$;
revoke all on function wellness_stock_add(uuid,uuid,uuid,text,int,text) from public,anon,authenticated;grant execute on function wellness_stock_add(uuid,uuid,uuid,text,int,text) to service_role;

create or replace function public.wellness_approve(p_actor uuid,p_event uuid,p_approve boolean) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e wellness_events; before_state jsonb;
begin
 select * into e from wellness_events where id=p_event for update;
 if not found then raise exception 'Day not found';end if;
 if not exists(select 1 from wellness_members m where m.id=p_actor and m.status='active' and (m.role='admin' or exists(select 1 from wellness_mission_members mm where mm.user_id=m.id and mm.role='admin' and mm.mission_id=e.mission_id))) then raise exception 'Administrator required';end if;
 if p_approve and exists(select 1 from wellness_receipts where operation->>'event_id'=p_event::text and result->>'status'='conflict') then raise exception 'Resolve conflicting submissions first';end if;
 if p_approve and exists(select 1 from wellness_records r where r.event_id=p_event and not exists(select 1 from wellness_records g where g.event_id=r.event_id and g.guest_id=r.guest_id and g.station='registration')) then raise exception 'Some guest IDs are still awaiting registration';end if;
 if p_approve and exists(select 1 from wellness_device_status where event_id=p_event and pending>0) then raise exception 'A phone still reports pending submissions. Sync it first.';end if;
 if p_approve and exists(select 1 from wellness_records r left join wellness_stock s on s.event_id=r.event_id and s.grade=r.data->>'grade' where r.event_id=p_event and r.station='glasses' and r.data->>'status'='Provided' group by r.data->>'grade',s.received having sum((r.data->>'quantity')::int)>coalesce(s.received,0)) then raise exception 'Reconcile negative glasses stock before approval';end if;
 before_state:=to_jsonb(e);
 update wellness_events set approval=case when p_approve then 'approved' else 'draft' end,closed=p_approve,approved_by=case when p_approve then p_actor else null end,approved_at=case when p_approve then now() else null end where id=p_event;
 insert into wellness_audit(event_id,station,actor,before_data,after_data) values(p_event,'Daily approval',p_actor,before_state,jsonb_build_object('approval',case when p_approve then 'approved' else 'draft' end));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function wellness_approve(uuid,uuid,boolean) from public,anon,authenticated;grant execute on function wellness_approve(uuid,uuid,boolean) to service_role;

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
 if st='registration' and not trip_admin and owner_device<>d.code then raise exception 'Registration ID belongs to another phone'; end if;
 perform pg_advisory_xact_lock(hashtextextended(eid::text||gid||st,2));
 select * into old from wellness_records where event_id=eid and guest_id=gid and station=st;
 if found and (not trip_admin or coalesce(p_operation->>'base_revision','')<>old.revision::text) then
  result:=jsonb_build_object('status','conflict','message','This station already has a record. An administrator must review both versions.');
  insert into wellness_receipts(id,user_id,operation,result) values(opid,p_actor,p_operation,result); return result;
 end if;
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

