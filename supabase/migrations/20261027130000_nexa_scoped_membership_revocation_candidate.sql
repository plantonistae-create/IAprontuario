-- Staging candidate: separate institution-scoped membership revocation.
-- Does not alter global profile capabilities or the existing admin RPC.
-- Requires explicit review and authenticated negative tests before application.
create or replace function public.revoke_organization_membership(
  p_membership_id uuid
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_target public.organization_memberships%rowtype;
begin
  if v_actor is null then
    raise sqlstate '42501' using message='AUTH_REQUIRED';
  end if;
  select * into v_target from public.organization_memberships
   where id=p_membership_id for update;
  if not found then
    raise sqlstate '42501' using message='MEMBERSHIP_NOT_ACCESSIBLE';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id=v_actor and p.access_status='active'
  ) or not private.org_has_any_role(
    v_target.organization_id,v_actor,array['owner','admin']::text[]
  ) then
    raise sqlstate '42501' using message='ORG_ADMIN_REQUIRED';
  end if;
  -- Prevent removal of the last active owner; require separate ownership transfer.\n  if 'owner'=any(v_target.roles) and not exists (\n    select 1 from public.organization_memberships other\n    where other.organization_id=v_target.organization_id\n      and other.id<>v_target.id and other.status='active'\n      and 'owner'=any(other.roles)\n  ) then\n    raise sqlstate '42501' using message='LAST_OWNER_REVOCATION_FORBIDDEN';\n  end if;\n  if v_target.user_id=v_actor then
    raise sqlstate '42501' using message='SELF_REVOCATION_FORBIDDEN';
  end if;
  if v_target.status<>'active' then
    return;
  end if;
  update public.organization_memberships
     set status='revoked',revoked_at=now()
   where id=v_target.id and status='active';
end;
$$;
revoke all on function public.revoke_organization_membership(uuid) from public,anon;
grant execute on function public.revoke_organization_membership(uuid) to authenticated;
