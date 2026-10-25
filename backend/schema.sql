-- Wellness 1.0: service gateway only; no health data is exposed through the browser Data API.
create table public.wellness_members (
 id uuid primary key references auth.users(id), email text not null unique, name text not null,
 role text not null default 'volunteer' check(role in ('admin','volunteer')),
 status text not null default 'pending' check(status in ('pending','active','disabled')),
 initials text unique check(initials ~ '^[A-Z]{2,5}$'), temporary_password boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.wellness_events (
 id uuid primary key, name text not null, starts date not null, ends date not null,
 location text not null default '', country text not null default 'Laos', frequency text not null default 'One-time',
 notes text not null default '', sample boolean not null default false, closed boolean not null default false,
 check(ends>=starts)
);
create table public.wellness_assignments (
 user_id uuid references public.wellness_members(id), event_id uuid references public.wellness_events(id),
 stations text[] not null check(stations <@ array['registration','measurements','glasses','dental','assessment']),
 primary key(user_id,event_id)
);
create table public.wellness_devices (
 id uuid primary key, user_id uuid not null references public.wellness_members(id),
 code bigint generated always as identity unique, prefix text not null, label text not null,
 created_at timestamptz not null default now(), retired boolean not null default false
);
create table public.wellness_records (
 event_id uuid references public.wellness_events(id), guest_id text not null,
 station text not null check(station in ('registration','measurements','glasses','dental','assessment')),
 data jsonb not null check(jsonb_typeof(data)='object'), revision uuid not null unique,
 author uuid not null references public.wellness_members(id), device_id uuid references public.wellness_devices(id),
 updated_at timestamptz not null default now(), primary key(event_id,guest_id,station)
);
create index wellness_records_author_idx on public.wellness_records(author,event_id);
create index wellness_records_device_idx on public.wellness_records(device_id);
create table public.wellness_receipts (
 id uuid primary key, user_id uuid not null references public.wellness_members(id), operation jsonb not null,
 result jsonb not null, created_at timestamptz not null default now()
);
create index wellness_receipts_user_idx on public.wellness_receipts(user_id);
create table public.wellness_audit (
 id uuid primary key default gen_random_uuid(), event_id uuid references public.wellness_events(id),
 guest_id text, station text, actor uuid references public.wellness_members(id),
 before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create index wellness_audit_event_idx on public.wellness_audit(event_id);
create index wellness_audit_actor_idx on public.wellness_audit(actor);
create table public.wellness_resources (
 id uuid primary key, kind text not null check(kind in ('appointment','recipe')), event_id uuid references public.wellness_events(id),
 data jsonb not null, sample boolean not null default false, revision uuid not null default gen_random_uuid()
);
create index wellness_resources_event_idx on public.wellness_resources(event_id);
create table public.wellness_rate_limits (key text primary key, bucket timestamptz not null, attempts int not null);
-- Only the authenticated, authorizing Edge Function has access. RLS denies every browser role.
do $$ declare t text; begin
 foreach t in array array['wellness_members','wellness_events','wellness_assignments','wellness_devices','wellness_records','wellness_receipts','wellness_audit','wellness_resources','wellness_rate_limits'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on sequence public.wellness_devices_code_seq to service_role;

-- Service-only, atomic compare-and-set and idempotency. The gateway validates fields and actor permissions too.
create or replace function public.wellness_apply(p_actor uuid, p_operation jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare m wellness_members; old wellness_records; receipt wellness_receipts; d wellness_devices;
 e wellness_events; opid uuid:=(p_operation->>'id')::uuid; eid uuid:=(p_operation->>'event_id')::uuid;
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
 select * into e from wellness_events where id=eid;
 if not found or e.closed then raise exception 'Event is unavailable or closed'; end if;
 if m.role<>'admin' and not exists(select 1 from wellness_assignments where user_id=p_actor and event_id=eid and st=any(stations)) then raise exception 'Station not assigned'; end if;
 select * into d from wellness_devices where id=(p_operation->>'device_id')::uuid and user_id=p_actor and not retired;
 if not found then raise exception 'Prepare this phone online first'; end if;
 if gid !~ '^[A-Z]{2,5}-[0-9]{4,12}-[0-9]{6,9}-[A-Z0-9]$' then raise exception 'Invalid guest ID'; end if;
 owner_device:=split_part(gid,'-',2)::bigint;
 if not exists(select 1 from wellness_devices where code=owner_device and prefix=split_part(gid,'-',1)) then raise exception 'Unknown registration phone code'; end if;
 if st='registration' and m.role<>'admin' and owner_device<>d.code then raise exception 'Registration ID belongs to another phone'; end if;
 perform pg_advisory_xact_lock(hashtextextended(eid::text||gid||st,2));
 select * into old from wellness_records where event_id=eid and guest_id=gid and station=st;
 if found and (m.role<>'admin' or coalesce(p_operation->>'base_revision','')<>old.revision::text) then
  result:=jsonb_build_object('status','conflict','message','This station already has a record. An administrator must review both versions.');
  insert into wellness_receipts(id,user_id,operation,result) values(opid,p_actor,p_operation,result); return result;
 end if;
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

create or replace function public.wellness_rate_limit(p_key text) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare n int;
begin
 insert into wellness_rate_limits(key,bucket,attempts) values(p_key,date_trunc('hour',now()),1)
 on conflict(key) do update set attempts=case when wellness_rate_limits.bucket<date_trunc('hour',now()) then 1 else wellness_rate_limits.attempts+1 end,bucket=date_trunc('hour',now()) returning attempts into n;
 return n<=5;
end $$;
revoke all on function public.wellness_rate_limit(text) from public,anon,authenticated;
grant execute on function public.wellness_rate_limit(text) to service_role;

-- Existing account passwords and Restaurant roles are preserved. Only owners start as Wellness admins.
insert into wellness_members(id,email,name,role,status)
select id,email,full_name,case when role='admin' then 'admin' else 'volunteer' end,
 case when role='admin' then 'active' else 'pending' end
from profiles where status='active';
