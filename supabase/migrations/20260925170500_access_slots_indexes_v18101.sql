begin;

create index if not exists clinical_slots_assigned_by_idx
  on private.clinical_slots(assigned_by);

create index if not exists profile_access_events_target_profile_idx
  on private.profile_access_events(target_profile_id);

create index if not exists profile_access_events_actor_user_idx
  on private.profile_access_events(actor_user_id);

create index if not exists profiles_access_assigned_by_idx
  on public.profiles(access_assigned_by);

commit;
