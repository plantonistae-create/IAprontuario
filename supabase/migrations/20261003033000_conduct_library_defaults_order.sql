-- NEXA v18.15.0 · biblioteca pessoal de condutas com defaults e ordem sincronizada

alter table public.profiles
  add column if not exists conduct_defaults_seeded_at timestamptz;

alter table public.conduct_templates
  add column if not exists sort_order integer not null default 0;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id
      order by updated_at desc nulls last, created_at asc, id
    ) - 1 as position
  from public.conduct_templates
)
update public.conduct_templates c
set sort_order = ranked.position::integer
from ranked
where ranked.id = c.id;

create index if not exists conduct_templates_user_sort_idx
  on public.conduct_templates(user_id, sort_order, created_at);

create or replace function public.ensure_default_conduct_templates()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  seeded_at timestamptz;
  default_owner uuid;
  start_order integer := 0;
  inserted_count integer := 0;
begin
  if caller is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;

  select p.conduct_defaults_seeded_at
    into seeded_at
  from public.profiles p
  where p.id=caller
    and p.clinical_access is true
    and p.access_status='active';

  if not found then
    raise exception using errcode='42501', message='CLINICAL_ACCESS_REQUIRED';
  end if;

  if seeded_at is not null then
    return 0;
  end if;

  select p.id
    into default_owner
  from public.profiles p
  where p.is_admin is true
    and p.is_reviewer is true
    and p.clinical_access is true
    and p.access_status='active'
  order by p.created_at asc, p.id asc
  limit 1;

  if default_owner is null then
    update public.profiles
       set conduct_defaults_seeded_at=now()
     where id=caller;
    return 0;
  end if;

  if default_owner=caller then
    update public.profiles
       set conduct_defaults_seeded_at=coalesce(conduct_defaults_seeded_at,now())
     where id=caller;
    return 0;
  end if;

  select coalesce(max(c.sort_order),-1)+1
    into start_order
  from public.conduct_templates c
  where c.user_id=caller;

  insert into public.conduct_templates(
    id,user_id,content,sort_order,created_at,updated_at
  )
  select
    gen_random_uuid(),
    caller,
    src.content,
    (start_order + row_number() over (
      order by src.sort_order asc, src.updated_at desc nulls last, src.created_at asc, src.id asc
    ) - 1)::integer,
    now(),
    now()
  from public.conduct_templates src
  where src.user_id=default_owner
    and not exists (
      select 1
      from public.conduct_templates own
      where own.user_id=caller
        and lower(btrim(own.content))=lower(btrim(src.content))
    )
  order by src.sort_order asc, src.updated_at desc nulls last, src.created_at asc, src.id asc;

  get diagnostics inserted_count = row_count;

  update public.profiles
     set conduct_defaults_seeded_at=now()
   where id=caller;

  return inserted_count;
end;
$$;

revoke all on function public.ensure_default_conduct_templates() from public;
grant execute on function public.ensure_default_conduct_templates() to authenticated;

create or replace function public.reorder_conduct_templates(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  requested_count integer;
  unique_count integer;
  own_count integer;
begin
  if caller is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;

  if not exists(
    select 1
    from public.profiles p
    where p.id=caller
      and p.clinical_access is true
      and p.access_status='active'
  ) then
    raise exception using errcode='42501', message='CLINICAL_ACCESS_REQUIRED';
  end if;

  if p_ids is null then
    raise exception using errcode='22023', message='INVALID_CONDUCT_ORDER';
  end if;

  select count(*),count(distinct x.id)
    into requested_count,unique_count
  from unnest(p_ids) as x(id);

  if requested_count<>unique_count then
    raise exception using errcode='22023', message='DUPLICATE_CONDUCT_IDS';
  end if;

  select count(*)
    into own_count
  from public.conduct_templates c
  where c.user_id=caller;

  if own_count<>requested_count then
    raise exception using errcode='22023', message='CONDUCT_ORDER_MUST_INCLUDE_ALL';
  end if;

  if exists(
    select 1
    from unnest(p_ids) as x(id)
    left join public.conduct_templates c
      on c.id=x.id and c.user_id=caller
    where c.id is null
  ) then
    raise exception using errcode='42501', message='CONDUCT_ORDER_NOT_OWNED';
  end if;

  with desired as (
    select x.id,(x.ordinality-1)::integer as position
    from unnest(p_ids) with ordinality as x(id,ordinality)
  )
  update public.conduct_templates c
     set sort_order=d.position
  from desired d
  where c.id=d.id
    and c.user_id=caller;
end;
$$;

revoke all on function public.reorder_conduct_templates(uuid[]) from public;
grant execute on function public.reorder_conduct_templates(uuid[]) to authenticated;
