-- ULC Portal · WIPE ALL DATA (fresh start)
-- Run in Supabase → SQL Editor.
-- WARNING: deletes every auth user, profile, award list, instructor, and teacher workspace.

-- App tables first (FKs to auth.users)
truncate table public.award_lists restart identity cascade;
truncate table public.teacher_workspaces restart identity cascade;
truncate table public.instructors restart identity cascade;
truncate table public.profiles restart identity cascade;

-- Auth identities + users (load-test + real accounts)
truncate table auth.identities cascade;
truncate table auth.sessions cascade;
truncate table auth.refresh_tokens cascade;
truncate table auth.mfa_factors cascade;
truncate table auth.mfa_challenges cascade;
truncate table auth.mfa_amr_claims cascade;
truncate table auth.one_time_tokens cascade;
truncate table auth.flow_state cascade;
delete from auth.users;

-- Optional cleanup of leftover auth schema rows (ignore if table missing)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='auth' and table_name='audit_log_entries') then
    execute 'truncate table auth.audit_log_entries';
  end if;
exception when others then
  raise notice 'auth audit cleanup skipped: %', sqlerrm;
end $$;
