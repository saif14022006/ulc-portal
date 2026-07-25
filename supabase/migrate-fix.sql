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
-- (instant login with real email; avoids confirmation email rate limits)

-- Ensure award list RLS covers delete/update (safe to re-run)
drop policy if exists "Own awards delete" on public.award_lists;
create policy "Own awards delete" on public.award_lists
  for delete using (auth.uid() = user_id);
drop policy if exists "Own awards update" on public.award_lists;
create policy "Own awards update" on public.award_lists
  for update using (auth.uid() = user_id);
drop policy if exists "Own awards insert" on public.award_lists;
create policy "Own awards insert" on public.award_lists
  for insert with check (auth.uid() = user_id);
drop policy if exists "Own awards read" on public.award_lists;
create policy "Own awards read" on public.award_lists
  for select using (auth.uid() = user_id);

-- Indexes for heavy award / profile reads
create index if not exists award_lists_user_idx on public.award_lists(user_id);
create index if not exists award_lists_user_updated_idx on public.award_lists(user_id, updated_at desc);
create index if not exists profiles_roll_idx on public.profiles(roll_no);
create index if not exists profiles_role_idx on public.profiles(role);

-- Profiles RLS (metal-strong ownership)
alter table public.profiles enable row level security;
drop policy if exists "Own profile read" on public.profiles;
create policy "Own profile read" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "Own profile upsert" on public.profiles;
create policy "Own profile upsert" on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists "Own profile update" on public.profiles;
create policy "Own profile update" on public.profiles
  for update using (auth.uid() = id);
