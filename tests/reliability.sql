begin;
do $$
declare owner_id uuid; trip uuid:=gen_random_uuid(); day_id uuid:=gen_random_uuid(); item_id uuid:=gen_random_uuid(); old jsonb; fresh jsonb; failed boolean; receipt_id uuid:=gen_random_uuid(); day_date text:=(now() at time zone 'Asia/Vientiane')::date::text;
begin
 select id into owner_id from wellness_members where role='admin' and not temporary_password order by id limit 1;
 old:=wellness_admin_save(owner_id,'mission',jsonb_build_object('id',trip,'name','Atomic rollback test','code','QA-'||upper(trip::text),'notes','','active',true));
 fresh:=wellness_admin_save(owner_id,'mission',old||'{"name":"Updated name"}');
 failed:=false;begin perform wellness_admin_save(owner_id,'mission',old);exception when others then failed:=true;end;if not failed then raise exception 'stale mission overwrote';end if;
 old:=wellness_admin_save(owner_id,'event',jsonb_build_object('id',day_id,'mission_id',trip,'name','QA day','starts',day_date,'location','QA location','country','Laos','notes','','closed',false));
 fresh:=wellness_admin_save(owner_id,'event',old||'{"name":"Updated day"}');
 failed:=false;begin perform wellness_admin_save(owner_id,'event',old);exception when others then failed:=true;end;if not failed then raise exception 'stale day overwrote';end if;
 old:=wellness_admin_save(owner_id,'resource',jsonb_build_object('id',item_id,'kind','appointment','event_id',day_id,'data','{"name":"Fictional appointment"}'::jsonb));
 perform wellness_approve(owner_id,day_id,true);
 failed:=false;begin perform wellness_admin_save(owner_id,'resource',old||'{"data":{"name":"Changed"}}');exception when others then failed:=true;end;if not failed then raise exception 'approved appointment changed';end if;
 perform wellness_approve(owner_id,day_id,false);
 perform wellness_admin_save(owner_id,'resource',old||'{"data":{"name":"Allowed after reopening"}}');
 failed:=false;begin perform wellness_admin_save(owner_id,'resource',old);exception when others then failed:=true;end;if not failed then raise exception 'stale appointment overwrote';end if;
 insert into wellness_records(event_id,guest_id,station,data,revision,author) values(day_id,'QA-ID','registration','{"name":"Fictional"}',gen_random_uuid(),owner_id);
 select to_jsonb(e) into old from wellness_events e where id=day_id;
 failed:=false;begin perform wellness_admin_save(owner_id,'event',old||'{"location":"Different venue"}');exception when others then failed:=true;end;if not failed then raise exception 'recorded event relocated';end if;
 insert into wellness_receipts(id,user_id,operation,result) values(receipt_id,owner_id,jsonb_build_object('event_id',day_id,'guest_id','QA-ID','station','registration','data','{"name":"Conflict"}'::jsonb),'{"status":"conflict"}');
 if wellness_resolve(owner_id,receipt_id)->>'status'<>'reviewed' then raise exception 'resolution failed';end if;
 perform wellness_resolve(owner_id,receipt_id);
 if(select count(*) from wellness_audit where event_id=day_id and station like 'Conflict review%')<>1 then raise exception 'conflict review audit duplicated or missing';end if;
 if has_table_privilege('authenticated','wellness_push_config','select') or has_table_privilege('anon','wellness_push_subscriptions','select') or has_function_privilege('authenticated','wellness_admin_save(uuid,text,jsonb)','execute') then raise exception 'privileged access exposed';end if;
end $$;
select 'PASS: atomic edits reject stale revisions, approvals freeze appointments, recorded sessions cannot move, conflict resolution is audited exactly once, push secrets are denied to browser roles' result;
rollback;
