-- NEXA invited and recovery users: check own password enrollment.
-- Must be applied before the frontend change; never expose auth.users or password hashes.
create or replace function public.nexa_password_setup_required()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then true
    else coalesce((
      select nullif(u.encrypted_password, '') is null
      from auth.users u
      where u.id = auth.uid()
    ), true)
  end
$$;
revoke all on function public.nexa_password_setup_required() from public, anon;
grant execute on function public.nexa_password_setup_required() to authenticated;
