-- Additive Wellness upgrade. Restaurant and existing Wellness records remain untouched.
alter table public.wellness_missions add column kind text not null default 'large' check(kind in ('large','regular'));
alter table public.wellness_missions add column location text not null default 'Oon Jai Wellness';
alter table public.wellness_grades add column low_stock integer not null default 5 check(low_stock>=0);
alter table public.wellness_records drop constraint wellness_records_station_check;
alter table public.wellness_records add constraint wellness_records_station_check check(station in ('registration','measurements','glasses','dental','assessment','consultation','programs'));
create index wellness_registration_person on public.wellness_records((coalesce(nullif(data->>'person_id',''),guest_id)),event_id) where station='registration';
create table public.wellness_inventory_locations(
 id text primary key, name text not null, kind text not null check(kind in ('main','regular','day')),
 mission_id uuid references public.wellness_missions(id),event_id uuid unique references public.wellness_events(id)
);
create index wellness_inventory_locations_mission on public.wellness_inventory_locations(mission_id);
create table public.wellness_inventory_balances(
 location_id text references public.wellness_inventory_locations(id),grade text references public.wellness_grades(grade),
 received integer not null default 0 check(received>=0),primary key(location_id,grade)
);
create index wellness_inventory_balances_grade on public.wellness_inventory_balances(grade);
create table public.wellness_inventory_moves(
 id uuid primary key,actor uuid not null references public.wellness_members(id),kind text not null check(kind in ('receipt','transfer','return','damage','adjustment','opening')),
 from_location text references public.wellness_inventory_locations(id),to_location text references public.wellness_inventory_locations(id),
 grade text not null references public.wellness_grades(grade),quantity integer not null check(quantity<>0),note text not null,created_at timestamptz not null default now()
);
create index wellness_inventory_moves_from on public.wellness_inventory_moves(from_location,created_at desc);
create index wellness_inventory_moves_to on public.wellness_inventory_moves(to_location,created_at desc);
create index wellness_inventory_moves_actor on public.wellness_inventory_moves(actor);
create index wellness_inventory_moves_grade on public.wellness_inventory_moves(grade);
insert into wellness_inventory_locations(id,name,kind) values('main','Main stock','main');
insert into wellness_inventory_locations(id,name,kind,mission_id,event_id) select 'day:'||id,starts::text||' · '||location,'day',mission_id,id from wellness_events;
insert into wellness_inventory_balances(location_id,grade,received) select 'day:'||event_id,grade,received from wellness_stock;
-- Original receiving history stays available in wellness_stock_log, without invented deliveries.
create or replace function public.wellness_inventory_location_trigger() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare k text;
begin
 if tg_table_name='wellness_missions' then
  if new.kind='regular' then insert into wellness_inventory_locations(id,name,kind,mission_id) values('regular:'||new.id,new.name||' stock','regular',new.id) on conflict(id) do update set name=excluded.name;end if;
 else
  select kind into k from wellness_missions where id=new.mission_id;
  if k<>'regular' then insert into wellness_inventory_locations(id,name,kind,mission_id,event_id) values('day:'||new.id,new.starts::text||' · '||new.location,'day',new.mission_id,new.id) on conflict(id) do update set name=excluded.name,mission_id=excluded.mission_id;end if;
 end if;return new;
end $$;
create trigger wellness_mission_stock_location after insert or update on wellness_missions for each row execute function wellness_inventory_location_trigger();
create trigger wellness_day_stock_location after insert or update on wellness_events for each row execute function wellness_inventory_location_trigger();

create or replace function public.wellness_inventory_available(p_location text,p_grade text) returns bigint language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select received from wellness_inventory_balances where location_id=p_location and grade=p_grade),0)-coalesce((
 select sum((r.data->>'quantity')::int) from wellness_records r join wellness_events e on e.id=r.event_id join wellness_missions m on m.id=e.mission_id
 where r.station='glasses' and r.data->>'status'='Provided' and r.data->>'grade'=p_grade
 and case when m.kind='regular' then 'regular:'||m.id else 'day:'||e.id end=p_location),0);
$$;
create or replace function public.wellness_inventory_move(p_actor uuid,p_item jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare ident uuid:=(p_item->>'id')::uuid;k text:=p_item->>'kind';src text:=nullif(p_item->>'from_location','');dst text:=nullif(p_item->>'to_location','');g text:=p_item->>'grade';q int:=(p_item->>'quantity')::int;n text:=btrim(p_item->>'note');prior wellness_inventory_moves;loc wellness_inventory_locations;
begin
 if not exists(select 1 from wellness_members where id=p_actor and role='admin' and status='active' and not temporary_password) then raise exception 'Administrator required';end if;
 perform pg_advisory_xact_lock(hashtextextended('wellness-inventory',11));
 select * into prior from wellness_inventory_moves where id=ident;
 if found then
  if prior.actor<>p_actor or prior.kind<>k or prior.from_location is distinct from src or prior.to_location is distinct from dst or prior.grade<>g or prior.quantity<>q or prior.note<>n then raise exception 'Stock operation ID already used';end if;
  return jsonb_build_object('status','saved');
 end if;
 if k not in ('receipt','transfer','return','damage','adjustment') or q is null or q=0 or abs(q)>1000000 or n is null or length(n)<3 or length(n)>1000 then raise exception 'Check movement type, quantity and explanation';end if;
 if k<>'adjustment' and q<0 then raise exception 'Enter a positive number of pairs';end if;
 if (k in ('receipt','adjustment') and (src is not null or dst is null)) or (k='damage' and (src is null or dst is not null)) or (k in ('transfer','return') and (src is null or dst is null or src=dst)) then raise exception 'Choose valid stock locations';end if;
 if not exists(select 1 from wellness_grades where grade=g and active) then raise exception 'Choose a valid grade';end if;
 if (src is not null and not exists(select 1 from wellness_inventory_locations where id=src)) or (dst is not null and not exists(select 1 from wellness_inventory_locations where id=dst)) then raise exception 'Stock location not found';end if;
 for loc in select * from wellness_inventory_locations where id in(src,dst) order by id loop
  if loc.event_id is not null then
   perform 1 from wellness_events where id=loc.event_id for update;
   if exists(select 1 from wellness_events where id=loc.event_id and approval='approved') then raise exception 'Reopen the approved day before changing its stock';end if;
  end if;
 end loop;
 -- Fictional stock can never be transferred into operational stock.
 if k in ('transfer','return') and (coalesce((select m.sample from wellness_inventory_locations l join wellness_missions m on m.id=l.mission_id where l.id=src),false) is distinct from coalesce((select m.sample from wellness_inventory_locations l join wellness_missions m on m.id=l.mission_id where l.id=dst),false)) then raise exception 'Sample stock must remain separate from real stock';end if;
 if src is not null and wellness_inventory_available(src,g)<q then raise exception 'Not enough available pairs at the source location. Sync all phones and check stock.';end if;
 if dst is not null then insert into wellness_inventory_balances(location_id,grade,received) values(dst,g,0) on conflict do nothing;update wellness_inventory_balances set received=received+q where location_id=dst and grade=g;end if;
 if src is not null then update wellness_inventory_balances set received=received-q where location_id=src and grade=g;end if;
 -- Mirror day allocations for older installed app versions until they refresh.
 insert into wellness_stock(event_id,grade,received) select l.event_id,b.grade,b.received from wellness_inventory_balances b join wellness_inventory_locations l on l.id=b.location_id where l.id in(src,dst) and l.event_id is not null and b.grade=g on conflict(event_id,grade) do update set received=excluded.received;
 insert into wellness_inventory_moves(id,actor,kind,from_location,to_location,grade,quantity,note) values(ident,p_actor,k,src,dst,g,q,n);
 return jsonb_build_object('status','saved');
end $$;
create or replace function public.wellness_stock_add(p_actor uuid,p_id uuid,p_event uuid,p_grade text,p_quantity int,p_note text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare loc text;
begin
 if exists(select 1 from wellness_stock_log where id=p_id) then
  if not exists(select 1 from wellness_stock_log where id=p_id and actor=p_actor and event_id=p_event and grade=p_grade and quantity=p_quantity and note=p_note) then raise exception 'Stock operation ID already used';end if;
  return jsonb_build_object('status','saved');
 end if;
 select case when m.kind='regular' then 'regular:'||m.id else 'day:'||e.id end into loc from wellness_events e join wellness_missions m on m.id=e.mission_id where e.id=p_event;
 return wellness_inventory_move(p_actor,jsonb_build_object('id',p_id,'kind','adjustment','to_location',loc,'grade',p_grade,'quantity',p_quantity,'note',p_note));
end $$;
create or replace function public.wellness_regular_day(p_actor uuid,p_item jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare mid uuid:=(p_item->>'mission_id')::uuid;d date:=(p_item->>'starts')::date;loc text:=btrim(p_item->>'location');day wellness_events;
begin
 if not exists(select 1 from wellness_members where id=p_actor and status='active' and not temporary_password and (role='admin' or exists(select 1 from wellness_mission_members where mission_id=mid and user_id=p_actor))) then raise exception 'Join the regular-visit team first';end if;
 if not exists(select 1 from wellness_missions where id=mid and kind='regular' and active) then raise exception 'Regular-visit workspace unavailable';end if;
 if d is null or loc is null or length(loc)<1 or length(loc)>200 then raise exception 'Check date and location';end if;
 perform pg_advisory_xact_lock(hashtextextended(mid::text||d::text||lower(loc),12));
 select * into day from wellness_events where mission_id=mid and starts=d and lower(btrim(location))=lower(loc);
 if not found then insert into wellness_events(id,mission_id,name,starts,ends,location) values((p_item->>'id')::uuid,mid,'Regular visits · '||d,d,d,loc) returning * into day;end if;
 return to_jsonb(day)||jsonb_build_object('kind','regular');
end $$;

do $$ declare t text;begin foreach t in array array['wellness_inventory_locations','wellness_inventory_balances','wellness_inventory_moves'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;
revoke all on function wellness_inventory_location_trigger(),wellness_inventory_available(text,text),wellness_inventory_move(uuid,jsonb),wellness_regular_day(uuid,jsonb) from public,anon,authenticated;
grant execute on function wellness_inventory_location_trigger(),wellness_inventory_available(text,text),wellness_inventory_move(uuid,jsonb),wellness_regular_day(uuid,jsonb) to service_role;

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
 if st='glasses' then perform pg_advisory_xact_lock(hashtextextended('wellness-inventory',11));end if;
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
 if st='registration' and nullif(p_operation->'data'->>'person_id','') is not null and p_operation->'data'->>'person_id'<>gid and not exists(select 1 from wellness_records r join wellness_events pe on pe.id=r.event_id where r.station='registration' and coalesce(nullif(r.data->>'person_id',''),r.guest_id)=p_operation->'data'->>'person_id' and (m.role='admin' or exists(select 1 from wellness_mission_members mm where mm.mission_id=pe.mission_id and mm.user_id=p_actor))) then raise exception 'Guest profile is not available to your team. Sync before linking this visit.';end if;
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


create or replace function public.wellness_approve(p_actor uuid,p_event uuid,p_approve boolean) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e wellness_events; before_state jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('wellness-inventory',11));
 select * into e from wellness_events where id=p_event for update;
 if not found then raise exception 'Day not found';end if;
 if not exists(select 1 from wellness_members m where m.id=p_actor and m.status='active' and (m.role='admin' or exists(select 1 from wellness_mission_members mm where mm.user_id=m.id and mm.role='admin' and mm.mission_id=e.mission_id))) then raise exception 'Administrator required';end if;
 if p_approve and exists(select 1 from wellness_receipts where operation->>'event_id'=p_event::text and result->>'status'='conflict') then raise exception 'Resolve conflicting submissions first';end if;
 if p_approve and exists(select 1 from wellness_records r where r.event_id=p_event and not exists(select 1 from wellness_records g where g.event_id=r.event_id and g.guest_id=r.guest_id and g.station='registration')) then raise exception 'Some guest IDs are still awaiting registration';end if;
 if p_approve and exists(select 1 from wellness_device_status where event_id=p_event and pending>0) then raise exception 'A phone still reports pending submissions. Sync it first.';end if;
 if p_approve and exists(select 1 from wellness_grades g join wellness_missions m on m.id=e.mission_id where wellness_inventory_available(case when m.kind='regular' then 'regular:'||m.id else 'day:'||e.id end,g.grade)<0) then raise exception 'Reconcile negative glasses stock before approval';end if;
 before_state:=to_jsonb(e);
 update wellness_events set approval=case when p_approve then 'approved' else 'draft' end,closed=p_approve,approved_by=case when p_approve then p_actor else null end,approved_at=case when p_approve then now() else null end where id=p_event;
 insert into wellness_audit(event_id,station,actor,before_data,after_data) values(p_event,'Daily approval',p_actor,before_state,jsonb_build_object('approval',case when p_approve then 'approved' else 'draft' end));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function wellness_approve(uuid,uuid,boolean) from public,anon,authenticated;grant execute on function wellness_approve(uuid,uuid,boolean) to service_role;


create or replace function public.wellness_admin_save(p_actor uuid,p_kind text,p_item jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare old_event wellness_events; old_mission wellness_missions; old_resource wellness_resources; ident uuid:=(p_item->>'id')::uuid; result jsonb; revision uuid:=gen_random_uuid();
begin
 if not exists(select 1 from wellness_members where id=p_actor and role='admin' and status='active' and not temporary_password) then raise exception 'Administrator required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_kind||ident::text,5));
 if p_kind='mission' then
  select * into old_mission from wellness_missions where id=ident for update;
  if found and coalesce(p_item->>'revision','')<>old_mission.revision::text then raise exception 'Mission changed. Refresh before editing.';end if;
  if old_mission.id is not null and old_mission.kind<>coalesce(p_item->>'kind',old_mission.kind) then raise exception 'Create a separate workspace to change its classification';end if;
  insert into wellness_missions(id,name,code,notes,sample,active,revision,kind,location) values(ident,p_item->>'name',p_item->>'code',p_item->>'notes',coalesce(old_mission.sample,false),(p_item->>'active')::boolean,revision,coalesce(p_item->>'kind',old_mission.kind,'large'),coalesce(nullif(p_item->>'location',''),old_mission.location,'Oon Jai Wellness'))
  on conflict(id) do update set name=excluded.name,code=excluded.code,notes=excluded.notes,active=excluded.active,revision=excluded.revision,location=excluded.location returning to_jsonb(wellness_missions.*) into result;
 elsif p_kind='event' then
  select * into old_event from wellness_events where id=ident for update;
  if found then
   if old_event.approval='approved' then raise exception 'Reopen the approved day before editing it';end if;
   if coalesce(p_item->>'revision','')<>old_event.revision::text then raise exception 'Day changed. Refresh before editing.';end if;
   if (exists(select 1 from wellness_records where event_id=ident) or exists(select 1 from wellness_inventory_balances b join wellness_inventory_locations l on l.id=b.location_id where l.event_id=ident and b.received<>0)) and (old_event.mission_id<>(p_item->>'mission_id')::uuid or old_event.starts<>(p_item->>'starts')::date or lower(btrim(old_event.location))<>lower(btrim(p_item->>'location'))) then raise exception 'A recorded day cannot be moved to another mission, date or location. Create a separate session.';end if;
  end if;
  insert into wellness_events(id,mission_id,name,starts,ends,location,country,notes,closed,sample,revision) values(ident,(p_item->>'mission_id')::uuid,p_item->>'name',(p_item->>'starts')::date,(p_item->>'starts')::date,p_item->>'location',p_item->>'country',p_item->>'notes',coalesce((p_item->>'closed')::boolean,false),coalesce(old_event.sample,false),revision)
  on conflict(id) do update set mission_id=excluded.mission_id,name=excluded.name,starts=excluded.starts,ends=excluded.ends,location=excluded.location,country=excluded.country,notes=excluded.notes,closed=excluded.closed,revision=excluded.revision returning to_jsonb(wellness_events.*) into result;
  if old_event.id is not null then insert into wellness_audit(event_id,station,actor,before_data,after_data) values(ident,'Event',p_actor,to_jsonb(old_event),result);end if;
 elsif p_kind='resource' then
  if nullif(p_item->>'event_id','') is not null then
   perform 1 from wellness_events where id=(p_item->>'event_id')::uuid for update;
   if exists(select 1 from wellness_events where id=(p_item->>'event_id')::uuid and approval='approved') then raise exception 'Reopen this day before changing its appointments';end if;
  end if;
  select * into old_resource from wellness_resources where id=ident for update;
  if found then
   if coalesce(p_item->>'revision','')<>old_resource.revision::text then raise exception 'This item changed. Sync before editing.';end if;
   if old_resource.event_id is distinct from nullif(p_item->>'event_id','')::uuid or old_resource.kind<>p_item->>'kind' then raise exception 'An existing item cannot be moved to another day or type';end if;
  end if;
  insert into wellness_resources(id,kind,event_id,data,sample,revision) values(ident,p_item->>'kind',nullif(p_item->>'event_id','')::uuid,p_item->'data',coalesce(old_resource.sample,false),revision)
  on conflict(id) do update set data=excluded.data,revision=excluded.revision returning to_jsonb(wellness_resources.*) into result;
  if old_resource.id is not null then insert into wellness_audit(event_id,station,actor,before_data,after_data) values(old_resource.event_id,old_resource.kind,p_actor,old_resource.data,p_item->'data');end if;
 else raise exception 'Unsupported administrative change';end if;
 return result;
end $$;
revoke all on function wellness_admin_save(uuid,text,jsonb) from public,anon,authenticated;grant execute on function wellness_admin_save(uuid,text,jsonb) to service_role;

