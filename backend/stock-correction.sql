create or replace function public.wellness_stock_add(p_actor uuid,p_id uuid,p_event uuid,p_grade text,p_quantity int,p_note text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from wellness_members m where m.id=p_actor and m.status='active' and (m.role='admin' or exists(select 1 from wellness_mission_members mm join wellness_events e on e.mission_id=mm.mission_id where mm.user_id=m.id and mm.role='admin' and e.id=p_event))) then raise exception 'Administrator required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,3));
 if exists(select 1 from wellness_stock_log where id=p_id) then
  if not exists(select 1 from wellness_stock_log where id=p_id and actor=p_actor and event_id=p_event and grade=p_grade and quantity=p_quantity and note=p_note) then raise exception 'Stock operation ID already used for different values';end if;
  return jsonb_build_object('status','saved');end if;
 perform 1 from wellness_events where id=p_event for update;
 if p_quantity=0 or length(trim(p_note))<3 then raise exception 'Enter a stock quantity and explanation';end if;
 if exists(select 1 from wellness_events where id=p_event and approval='approved') then raise exception 'Reopen this day before changing its stock';end if;
 insert into wellness_stock(event_id,grade,received) values(p_event,p_grade,0) on conflict do nothing;
 update wellness_stock set received=received+p_quantity where event_id=p_event and grade=p_grade;
 insert into wellness_stock_log(id,event_id,grade,quantity,actor,note) values(p_id,p_event,p_grade,p_quantity,p_actor,p_note);
 return jsonb_build_object('status','saved');
end $$;
revoke all on function wellness_stock_add(uuid,uuid,uuid,text,int,text) from public,anon,authenticated;grant execute on function wellness_stock_add(uuid,uuid,uuid,text,int,text) to service_role;
