-- ULC Portal · run this in Supabase → SQL Editor (safe to re-run)
-- Fixes missing columns/tables found by connectivity check.

-- Profiles: columns the app expects
alter table public.profiles add column if not exists role text default 'student';
alter table public.profiles add column if not exists current_semester int;
alter table public.profiles add column if not exists session text;
alter table public.profiles add column if not exists prev_gpa numeric;
alter table public.profiles add column if not exists cgpa numeric;
alter table public.profiles add column if not exists notes text;
alter table public.profiles add column if not exists profile_complete boolean default false;

-- Shared instructor names (cover page picker)
create table if not exists public.instructors (
  id uuid primary key default gen_random_uuid(),
  official_name text unique not null,
  updated_at timestamptz default now()
);
alter table public.instructors enable row level security;
drop policy if exists "Anyone can read instructors" on public.instructors;
create policy "Anyone can read instructors" on public.instructors
  for select using (true);
drop policy if exists "Authenticated can insert instructors" on public.instructors;
create policy "Authenticated can insert instructors" on public.instructors
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "Authenticated can update instructors" on public.instructors;
create policy "Authenticated can update instructors" on public.instructors
  for update using (auth.role() = 'authenticated');

-- Optional teacher cloud workspace (app currently keeps teachers local)
create table if not exists public.teacher_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  official_name text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table public.teacher_workspaces enable row level security;
drop policy if exists "Own teacher workspace read" on public.teacher_workspaces;
create policy "Own teacher workspace read" on public.teacher_workspaces
  for select using (auth.uid() = user_id);
drop policy if exists "Own teacher workspace upsert" on public.teacher_workspaces;
create policy "Own teacher workspace upsert" on public.teacher_workspaces
  for insert with check (auth.uid() = user_id);
drop policy if exists "Own teacher workspace update" on public.teacher_workspaces;
create policy "Own teacher workspace update" on public.teacher_workspaces
  for update using (auth.uid() = user_id);
drop policy if exists "Own teacher workspace delete" on public.teacher_workspaces;
create policy "Own teacher workspace delete" on public.teacher_workspaces
  for delete using (auth.uid() = user_id);

-- After running:
-- Authentication → Providers → Email → turn OFF "Confirm email"
-- (stops rate-limit / confirmation emails for roll@students.ulc.local signups)
