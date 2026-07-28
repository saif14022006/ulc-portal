-- ULC Toolkit · allow signed-in users to delete their own account (safe to re-run)
-- Run in Supabase → SQL Editor after deploy.
-- Used by Account → Settings → Delete my account

create or replace function public.delete_own_account()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.award_lists where user_id = uid;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'teacher_workspaces'
  ) then
    delete from public.teacher_workspaces where user_id = uid;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'student_workspaces'
  ) then
    delete from public.student_workspaces where user_id = uid;
  end if;

  delete from public.profiles where id = uid;

  -- Remove auth user (cascades identities/sessions when FK is set)
  delete from auth.users where id = uid;

  return json_build_object('ok', true, 'deleted_user_id', uid);
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
