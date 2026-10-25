-- Applied only to the old Accounting project after Wellness moved to Restaurant.
-- Abort if any non-sample use appeared. No CASCADE: unrelated dependencies must block removal.
do $$ begin
 if exists(select 1 from public.wellness_events where not sample)
 or exists(select 1 from public.wellness_devices where id<>'00000000-0000-4000-a000-000000000001')
 or exists(select 1 from public.wellness_receipts)
 or exists(select 1 from public.wellness_mission_members)
 or exists(select 1 from auth.users where raw_app_meta_data->>'wellness_only'='true')
 then raise exception 'Real Wellness use detected; migrate these records before retiring Accounting tables'; end if;
end $$;
drop function public.wellness_apply(uuid,jsonb),public.wellness_approve(uuid,uuid,boolean),public.wellness_join(uuid,text),public.wellness_rate_guard(text,integer),public.wellness_rate_limit(text),public.wellness_stock_add(uuid,uuid,uuid,text,integer,text);
drop table public.wellness_assignments,public.wellness_audit,public.wellness_device_status,public.wellness_devices,public.wellness_events,public.wellness_grades,public.wellness_members,public.wellness_mission_members,public.wellness_missions,public.wellness_rate_limits,public.wellness_receipts,public.wellness_records,public.wellness_resources,public.wellness_stock,public.wellness_stock_log;
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path='public' as $function$
begin
 insert into public.profiles(id,email,full_name)
 values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name',''))
 on conflict(id) do nothing;
 return new;
end $function$;
