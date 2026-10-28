begin;
do $$
declare owner_id uuid; vol uuid; mid uuid:=gen_random_uuid(); other_mid uuid:=gen_random_uuid(); eid uuid:=gen_random_uuid(); dev uuid:=gen_random_uuid(); dev2 uuid:=gen_random_uuid(); a jsonb;b jsonb; r wellness_ticket_ranges; gid text; op jsonb; failed boolean;
begin
 select id into owner_id from wellness_members where role='admin' and status='active' and not temporary_password limit 1;
 select id into vol from wellness_members where role='volunteer' and not temporary_password limit 1;
 update wellness_members set status='active' where id=vol;
 perform wellness_admin_save(owner_id,'mission',jsonb_build_object('id',mid,'name','QA tickets','code','QA-'||upper(mid::text),'active',true,'notes','Rollback only','country','Thailand','province','Chiang Mai'));
 perform wellness_admin_save(owner_id,'mission',jsonb_build_object('id',other_mid,'name','QA isolated','code','QA-'||upper(other_mid::text),'active',true,'notes','Rollback only'));
 if not exists(select 1 from wellness_missions where id=mid and country='Thailand' and province='Chiang Mai') then raise exception 'Event address was not saved';end if;
 insert into wellness_mission_members(mission_id,user_id) values(mid,vol);
 insert into wellness_devices(id,user_id,prefix,label) values(dev,vol,'QA','Rollback phone'),(dev2,owner_id,'QB','Rollback phone 2');
 failed:=false;begin perform wellness_ticket_context(vol,other_mid,dev,null);exception when others then failed:=true;end;if not failed then raise exception 'Unjoined event accepted';end if;
 failed:=false;begin perform wellness_ticket_context(vol,mid,dev2,null);exception when others then failed:=true;end;if not failed then raise exception 'Other phone accepted';end if;
 a:=wellness_ticket_context(vol,mid,dev,null);b:=wellness_ticket_context(vol,mid,dev,null);
 if a<>b then raise exception 'Reservation retry allocated twice';end if;
 select * into r from wellness_ticket_ranges where mission_id=mid and device_id=dev;
 if r.first_number<>1 or r.last_number<>500 then raise exception 'First allocation incorrect';end if;
 perform wellness_ticket_context(owner_id,mid,dev2,null);
 if not exists(select 1 from wellness_ticket_ranges where device_id=dev2 and first_number=501) then raise exception 'Phones overlap';end if;
 perform wellness_ticket_context(vol,mid,dev,r.id);perform wellness_ticket_context(vol,mid,dev,r.id);
 if (select count(*) from wellness_ticket_ranges where mission_id=mid and device_id=dev)<>2 then raise exception 'Refill retry allocated twice';end if;
 insert into wellness_events(id,mission_id,name,starts,ends,location) values(eid,mid,'QA day',current_date,current_date,'QA venue');
 gid:=r.prefix||'-'||lpad(r.device_code::text,4,'0')||'-'||(500000000+r.id*500)::text||'-X';
 op:=jsonb_build_object('id',gen_random_uuid(),'event_id',eid,'device_id',dev,'guest_id',gid,'station','dental','data',jsonb_build_object('status','Completed'),'captured_at',now(),'date_ack',true);
 perform wellness_apply(vol,op); -- services may arrive before registration
 perform wellness_apply(vol,op); -- retries remain idempotent
 perform wellness_apply(vol,op||jsonb_build_object('id',gen_random_uuid(),'station','registration','data',jsonb_build_object('name','Fictional ticket guest','language','Lao')));
 a:=wellness_ticket_context(vol,mid,null,null);
 if (select count(*) from wellness_ticket_ranges where mission_id=mid)<>3 then raise exception 'Generated ID was assigned a second alias';end if;
 gid:=r.prefix||'-'||lpad(r.device_code::text,4,'0')||'-000001-X';
 perform wellness_apply(vol,op||jsonb_build_object('id',gen_random_uuid(),'guest_id',gid,'station','registration','data',jsonb_build_object('name','Legacy fictional guest')));
 perform wellness_ticket_context(vol,mid,null,null);perform wellness_ticket_context(vol,mid,null,null);
 if (select count(*) from wellness_ticket_ranges where mission_id=mid and legacy_guest_id=gid)<>1 then raise exception 'Legacy alias duplicated';end if;
 if has_table_privilege('authenticated','wellness_ticket_ranges','select') or has_function_privilege('anon','wellness_ticket_context(uuid,uuid,uuid,bigint)','execute') then raise exception 'Ticket allocations exposed';end if;
end $$;
rollback;
