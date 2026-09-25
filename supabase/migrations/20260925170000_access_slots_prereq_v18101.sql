begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.profiles
  add column if not exists access_assigned_at timestamptz,
  add column if not exists access_assigned_by uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.profiles'::regclass
      and conname='profiles_access_assigned_by_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_access_assigned_by_fkey
      foreign key (access_assigned_by) references public.profiles(id) on delete set null;
  end if;
end $$;

create table if not exists private.clinical_slots(
  slot_no smallint primary key check (slot_no between 1 and 5),
  profile_id uuid unique references public.profiles(id) on delete set null,
  assigned_at timestamptz,
  assigned_by uuid references public.profiles(id) on delete set null,
  constraint clinical_slots_assignment_check check (
    (profile_id is null and assigned_at is null)
    or (profile_id is not null and assigned_at is not null)
  )
);

create table if not exists private.profile_access_events(
  id bigint generated always as identity primary key,
  target_profile_id uuid not null references public.profiles(id),
  actor_user_id uuid references public.profiles(id) on delete set null,
  old_is_admin boolean,
  new_is_admin boolean,
  old_is_reviewer boolean,
  new_is_reviewer boolean,
  old_clinical_access boolean,
  new_clinical_access boolean,
  old_access_status text,
  new_access_status text,
  reason text,
  occurred_at timestamptz not null default now()
);

insert into private.clinical_slots(slot_no)
select gs::smallint from generate_series(1,5) gs
on conflict (slot_no) do nothing;

do $$
declare
  active_count integer;
  occupied_count integer;
begin
  select count(*) into active_count
  from public.profiles
  where clinical_access is true and access_status='active';

  if active_count > 5 then
    raise exception using
      errcode='P0001',
      message='CLINICAL_SLOT_LIMIT_REACHED',
      detail='More than five active clinical profiles exist; slot backfill aborted.';
  end if;

  select count(*) into occupied_count
  from private.clinical_slots
  where profile_id is not null;

  if occupied_count > 5 then
    raise exception using errcode='P0001', message='INVALID_CLINICAL_SLOT_STATE';
  end if;

  with missing as (
    select p.id,
           row_number() over(order by p.created_at,p.id) rn
    from public.profiles p
    where p.clinical_access is true
      and p.access_status='active'
      and not exists(select 1 from private.clinical_slots s where s.profile_id=p.id)
  ),
  free as (
    select s.slot_no,
           row_number() over(order by s.slot_no) rn
    from private.clinical_slots s
    where s.profile_id is null
  )
  update private.clinical_slots s
     set profile_id=m.id,
         assigned_at=now(),
         assigned_by=null
  from missing m
  join free f using(rn)
  where s.slot_no=f.slot_no;

  if exists (
    select 1
    from public.profiles p
    where p.clinical_access is true
      and p.access_status='active'
      and not exists(select 1 from private.clinical_slots s where s.profile_id=p.id)
  ) then
    raise exception using errcode='P0001', message='CLINICAL_SLOT_BACKFILL_INCOMPLETE';
  end if;
end $$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.updated_at:=now();
  return new;
end;
$$;

create or replace function private.sync_clinical_slot()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  claimed_slot smallint;
begin
  if not (new.clinical_access is true and new.access_status='active') then
    update private.clinical_slots
       set profile_id=null,assigned_at=null,assigned_by=null
     where profile_id=new.id;
    return new;
  end if;

  if exists(select 1 from private.clinical_slots where profile_id=new.id) then
    return new;
  end if;

  select slot_no into claimed_slot
  from private.clinical_slots
  where profile_id is null
  order by slot_no
  for update skip locked
  limit 1;

  if claimed_slot is null then
    raise exception using
      errcode='P0001',
      message='CLINICAL_SLOT_LIMIT_REACHED',
      detail='All five active clinical access slots are occupied.';
  end if;

  update private.clinical_slots
     set profile_id=new.id,
         assigned_at=now(),
         assigned_by=new.access_assigned_by
   where slot_no=claimed_slot;

  return new;
end;
$$;

create or replace function private.audit_profile_access_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid;
begin
  if old.is_admin is not distinct from new.is_admin
     and old.is_reviewer is not distinct from new.is_reviewer
     and old.clinical_access is not distinct from new.clinical_access
     and old.access_status is not distinct from new.access_status then
    return new;
  end if;

  actor:=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
  insert into private.profile_access_events(
    target_profile_id,actor_user_id,
    old_is_admin,new_is_admin,old_is_reviewer,new_is_reviewer,
    old_clinical_access,new_clinical_access,
    old_access_status,new_access_status,reason
  ) values(
    new.id,actor,
    old.is_admin,new.is_admin,old.is_reviewer,new.is_reviewer,
    old.clinical_access,new.clinical_access,
    old.access_status,new.access_status,
    nullif(current_setting('nexa.access_change_reason',true),'')
  );
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

drop trigger if exists "10_sync_clinical_slot" on public.profiles;
create trigger "10_sync_clinical_slot"
after insert or update on public.profiles
for each row execute function private.sync_clinical_slot();

drop trigger if exists "20_audit_profile_access_change" on public.profiles;
create trigger "20_audit_profile_access_change"
after update on public.profiles
for each row execute function private.audit_profile_access_change();

create or replace function public.has_active_clinical_access()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.profiles p
    join private.clinical_slots s on s.profile_id=p.id
    where p.id=auth.uid()
      and p.clinical_access is true
      and p.access_status='active'
      and s.slot_no between 1 and 5
  )
$$;

create or replace function public.get_my_account_context()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'id',p.id,
    'display_name',p.display_name,
    'is_admin',p.is_admin,
    'is_reviewer',p.is_reviewer,
    'clinical_access',p.clinical_access,
    'access_status',p.access_status,
    'slot_no',s.slot_no,
    'slots_occupied',(select count(*) from private.clinical_slots cs where cs.profile_id is not null),
    'slots_total',5
  )
  from public.profiles p
  left join private.clinical_slots s on s.profile_id=p.id
  where p.id=auth.uid()
$$;

create or replace function public.get_admin_user_directory()
returns table(
  id uuid,display_name text,is_admin boolean,is_reviewer boolean,
  clinical_access boolean,access_status text,slot_no smallint,
  created_at timestamptz,updated_at timestamptz,access_assigned_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.is_admin is true and p.access_status='active'
  ) then
    raise exception using errcode='42501',message='ADMIN_REQUIRED';
  end if;

  return query
  select p.id,p.display_name,p.is_admin,p.is_reviewer,
         p.clinical_access,p.access_status,s.slot_no,
         p.created_at,p.updated_at,p.access_assigned_at
  from public.profiles p
  left join private.clinical_slots s on s.profile_id=p.id
  order by p.created_at,p.id;
end;
$$;

create or replace function public.admin_set_profile_access(
  p_profile_id uuid,
  p_is_admin boolean,
  p_is_reviewer boolean,
  p_clinical_access boolean,
  p_access_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid:=auth.uid();
  result jsonb;
begin
  if not exists(
    select 1 from public.profiles p
    where p.id=caller and p.is_admin is true and p.access_status='active'
  ) then
    raise exception using errcode='42501',message='ADMIN_REQUIRED';
  end if;

  if p_is_admin is null or p_is_reviewer is null or p_clinical_access is null
     or p_access_status not in ('pending','active','disabled') then
    raise exception using errcode='22023',message='INVALID_PROFILE_CAPABILITIES';
  end if;

  if p_access_status='pending'
     and (p_is_admin is true or p_is_reviewer is true or p_clinical_access is true) then
    raise exception using errcode='22023',message='PENDING_PROFILE_CANNOT_HAVE_CAPABILITIES';
  end if;

  if p_access_status='active'
     and not (p_is_admin is true or p_is_reviewer is true or p_clinical_access is true) then
    raise exception using errcode='22023',message='ACTIVE_PROFILE_REQUIRES_CAPABILITY';
  end if;

  if nullif(btrim(p_reason),'') is null then
    raise exception using errcode='22023',message='ACCESS_CHANGE_REASON_REQUIRED';
  end if;

  if caller=p_profile_id and (p_is_admin is not true or p_access_status<>'active') then
    raise exception using errcode='22023',message='ADMIN_CANNOT_DISABLE_SELF';
  end if;

  perform set_config('nexa.access_change_reason',left(btrim(p_reason),500),true);

  update public.profiles
     set is_admin=p_is_admin,
         is_reviewer=p_is_reviewer,
         clinical_access=p_clinical_access,
         access_status=p_access_status,
         access_assigned_at=now(),
         access_assigned_by=caller,
         updated_at=now()
   where id=p_profile_id;

  if not found then
    raise exception using errcode='P0002',message='PROFILE_NOT_FOUND';
  end if;

  select jsonb_build_object(
    'id',p.id,
    'display_name',p.display_name,
    'is_admin',p.is_admin,
    'is_reviewer',p.is_reviewer,
    'clinical_access',p.clinical_access,
    'access_status',p.access_status,
    'slot_no',s.slot_no
  ) into result
  from public.profiles p
  left join private.clinical_slots s on s.profile_id=p.id
  where p.id=p_profile_id;

  return result;
end;
$$;

revoke all on function public.has_active_clinical_access() from public,anon;
revoke all on function public.get_my_account_context() from public,anon;
revoke all on function public.get_admin_user_directory() from public,anon;
revoke all on function public.admin_set_profile_access(uuid,boolean,boolean,boolean,text,text) from public,anon;

grant execute on function public.has_active_clinical_access() to authenticated;
grant execute on function public.get_my_account_context() to authenticated;
grant execute on function public.get_admin_user_directory() to authenticated;
grant execute on function public.admin_set_profile_access(uuid,boolean,boolean,boolean,text,text) to authenticated;

commit;
