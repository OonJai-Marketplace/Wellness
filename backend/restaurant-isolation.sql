-- GoTrue can set trusted app_metadata after the initial INSERT. Isolate on both insert and update.
create or replace function restaurant_private.wellness_profile_isolation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.raw_app_meta_data->>'wellness_only'='true' then
  -- No existing Restaurant identity is tagged by the Wellness signup endpoint.
  update public.profiles set status='inactive' where id=new.id;
  if new.last_sign_in_at is null and new.created_at>now()-interval '10 minutes' then
   begin
    delete from public.profiles where id=new.id and created_at>=new.created_at-interval '1 minute';
   exception when foreign_key_violation then
    -- Preserve referenced restaurant history; leave the profile inactive instead.
    null;
   end;
  end if;
 end if;
 return new;
end $$;
revoke all on function restaurant_private.wellness_profile_isolation() from public,anon,authenticated;
create trigger zz_wellness_profile_isolation after insert or update of raw_app_meta_data on auth.users for each row execute function restaurant_private.wellness_profile_isolation();
