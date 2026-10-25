-- Atomic administrative changes, conflict audit, and browser-notification storage.
alter table public.wellness_events add column revision uuid not null default gen_random_uuid();
alter table public.wellness_missions add column revision uuid not null default gen_random_uuid();
create index if not exists wellness_receipts_conflicts_event on public.wellness_receipts((operation->>'event_id'),created_at) where result->>'status'='conflict';
create index if not exists wellness_stock_grade on public.wellness_stock(grade);
create index if not exists wellness_stock_log_grade on public.wellness_stock_log(grade);

create or replace function public.wellness_admin_save(p_actor uuid,p_kind text,p_item jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare old_event wellness_events; old_mission wellness_missions; old_resource wellness_resources; ident uuid:=(p_item->>'id')::uuid; result jsonb; revision uuid:=gen_random_uuid();
begin
 if not exists(select 1 from wellness_members where id=p_actor and role='admin' and status='active' and not temporary_password) then raise exception 'Administrator required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_kind||ident::text,5));
 if p_kind='mission' then
  select * into old_mission from wellness_missions where id=ident for update;
  if found and coalesce(p_item->>'revision','')<>old_mission.revision::text then raise exception 'Mission changed. Refresh before editing.';end if;
  insert into wellness_missions(id,name,code,notes,sample,active,revision) values(ident,p_item->>'name',p_item->>'code',p_item->>'notes',coalesce(old_mission.sample,false),(p_item->>'active')::boolean,revision)
  on conflict(id) do update set name=excluded.name,code=excluded.code,notes=excluded.notes,active=excluded.active,revision=excluded.revision returning to_jsonb(wellness_missions.*) into result;
 elsif p_kind='event' then
  select * into old_event from wellness_events where id=ident for update;
  if found then
   if old_event.approval='approved' then raise exception 'Reopen the approved day before editing it';end if;
   if coalesce(p_item->>'revision','')<>old_event.revision::text then raise exception 'Day changed. Refresh before editing.';end if;
   if exists(select 1 from wellness_records where event_id=ident) and (old_event.mission_id<>(p_item->>'mission_id')::uuid or old_event.starts<>(p_item->>'starts')::date or lower(btrim(old_event.location))<>lower(btrim(p_item->>'location'))) then raise exception 'A recorded day cannot be moved to another mission, date or location. Create a separate session.';end if;
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

create or replace function public.wellness_resolve(p_actor uuid,p_id uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare item wellness_receipts; eid uuid;
begin
 if not exists(select 1 from wellness_members where id=p_actor and role='admin' and status='active' and not temporary_password) then raise exception 'Administrator required';end if;
 select (operation->>'event_id')::uuid into eid from wellness_receipts where id=p_id;
 if eid is null then raise exception 'Conflict not found';end if;
 perform 1 from wellness_events where id=eid for update;
 select * into item from wellness_receipts where id=p_id for update;
 if item.result->>'status'='reviewed' then return item.result;end if;
 if item.result->>'status'<>'conflict' then raise exception 'This submission is not a conflict';end if;
 if exists(select 1 from wellness_events where id=eid and approval='approved') then raise exception 'Reopen this day before reviewing conflicts';end if;
 update wellness_receipts set result=jsonb_build_object('status','reviewed','reviewed_by',p_actor,'message','Administrator reviewed this submission.') where id=p_id returning * into item;
 insert into wellness_audit(event_id,guest_id,station,actor,before_data,after_data) values(eid,item.operation->>'guest_id','Conflict review · '||(item.operation->>'station'),p_actor,item.operation,jsonb_build_object('receipt_id',p_id,'resolution','Reviewed; retained current station record'));
 return item.result;
end $$;
revoke all on function wellness_resolve(uuid,uuid) from public,anon,authenticated;grant execute on function wellness_resolve(uuid,uuid) to service_role;

create table public.wellness_push_config(id int primary key check(id=1),public_key text not null,private_key text not null);
create table public.wellness_push_subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid not null references wellness_members(id),endpoint text not null unique,keys jsonb not null,created_at timestamptz not null default now());
create index if not exists wellness_push_user on wellness_push_subscriptions(user_id);
create table public.wellness_push_jobs(id uuid primary key references wellness_receipts(id),created_at timestamptz not null default now(),attempts int not null default 0,claimed_until timestamptz,completed_at timestamptz);
do $$ declare t text;begin foreach t in array array['wellness_push_config','wellness_push_subscriptions','wellness_push_jobs'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;
create or replace function public.wellness_push_claim() returns setof wellness_push_jobs language sql security invoker set search_path=public,pg_temp as $$
 update wellness_push_jobs set claimed_until=now()+interval '1 minute',attempts=attempts+1 where id in(select id from wellness_push_jobs where completed_at is null and attempts<5 and (claimed_until is null or claimed_until<now()) order by created_at for update skip locked limit 5) returning *;
$$;
revoke all on function wellness_push_claim() from public,anon,authenticated;grant execute on function wellness_push_claim() to service_role;
