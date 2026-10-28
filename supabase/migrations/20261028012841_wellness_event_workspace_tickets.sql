-- Event metadata and short paper aliases. Existing record IDs are never rewritten.
alter table public.wellness_missions add column country text not null default 'Laos';
alter table public.wellness_missions add column province text not null default '';
-- Preserve a previously configured session country when upgrading existing events.
update public.wellness_missions m set country=e.country from
 (select distinct on(mission_id) mission_id,country from public.wellness_events where country<>'' order by mission_id,starts desc,id) e where e.mission_id=m.id;
create table public.wellness_ticket_ranges(
 id bigint generated always as identity primary key check(id<998000),
 mission_id uuid not null references public.wellness_missions(id),
 device_id uuid references public.wellness_devices(id),
 prefix text,device_code bigint,
 first_number integer not null check(first_number>=1),
 last_number integer not null check(last_number>=first_number and last_number<=259974),
 legacy_guest_id text,
 created_at timestamptz not null default now(),
 unique(mission_id,first_number),unique(mission_id,legacy_guest_id),
 check((legacy_guest_id is not null and device_id is null and first_number=last_number) or
       (legacy_guest_id is null and device_id is not null and prefix is not null and device_code is not null and last_number-first_number<500))
);
create index wellness_ticket_ranges_device on public.wellness_ticket_ranges(device_id,mission_id,id desc);
alter table public.wellness_ticket_ranges enable row level security;
revoke all on public.wellness_ticket_ranges from public,anon,authenticated;
grant all on public.wellness_ticket_ranges to service_role;
grant usage,select on sequence public.wellness_ticket_ranges_id_seq to service_role;

-- The gateway supplies the verified caller. Authorization is repeated here;
-- no browser role can execute this RPC or read allocation rows directly.
create or replace function public.wellness_ticket_context(p_actor uuid,p_mission uuid,p_device uuid default null,p_after bigint default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare member wellness_members; phone wellness_devices; g record; next_number integer; latest bigint;
begin
 select * into member from wellness_members where id=p_actor and status='active' and not temporary_password;
 if not found then raise exception 'Active team access required';end if;
 if not exists(select 1 from wellness_missions where id=p_mission) then raise exception 'Event not found';end if;
 if member.role<>'admin' and not exists(select 1 from wellness_mission_members where mission_id=p_mission and user_id=p_actor) then raise exception 'Join this event first';end if;
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

create or replace function public.wellness_admin_save(p_actor uuid,p_kind text,p_item jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare old_event wellness_events; old_mission wellness_missions; old_resource wellness_resources; ident uuid:=(p_item->>'id')::uuid; result jsonb; revision uuid:=gen_random_uuid();
begin
 if not exists(select 1 from wellness_members where id=p_actor and role='admin' and status='active' and not temporary_password) then raise exception 'Administrator required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_kind||ident::text,5));
 if p_kind='mission' then
  select * into old_mission from wellness_missions where id=ident for update;
  if found and coalesce(p_item->>'revision','')<>old_mission.revision::text then raise exception 'Mission changed. Refresh before editing.';end if;
  if old_mission.id is not null and old_mission.kind<>coalesce(p_item->>'kind',old_mission.kind) then raise exception 'Create a separate workspace to change its classification';end if;
  insert into wellness_missions(id,name,code,notes,sample,active,revision,kind,location,country,province) values(ident,p_item->>'name',p_item->>'code',p_item->>'notes',coalesce(old_mission.sample,false),(p_item->>'active')::boolean,revision,coalesce(p_item->>'kind',old_mission.kind,'large'),coalesce(nullif(p_item->>'location',''),old_mission.location,'Oon Jai Wellness'),coalesce(nullif(p_item->>'country',''),old_mission.country,'Laos'),coalesce(p_item->>'province',old_mission.province,''))
  on conflict(id) do update set name=excluded.name,code=excluded.code,notes=excluded.notes,active=excluded.active,revision=excluded.revision,location=excluded.location,country=excluded.country,province=excluded.province returning to_jsonb(wellness_missions.*) into result;
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

