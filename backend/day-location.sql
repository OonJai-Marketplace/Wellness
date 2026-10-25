-- A mission has one workspace for each date and location.
create unique index wellness_events_day_location on public.wellness_events(mission_id, starts, lower(btrim(location)));
