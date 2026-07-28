-- ULC Toolkit · teacher workspace table (safe to re-run)
-- Stores every signed-in teacher's saved desk data:
-- classes, roster, attendance, marks, official name, My Files metadata.
-- View in Supabase → Table Editor → teacher_workspaces

create table if not exists public.teacher_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  official_name text,
  class_count integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.teacher_workspaces add column if not exists email text;
alter table public.teacher_workspaces add column if not exists full_name text;
alter table public.teacher_workspaces add column if not exists class_count integer not null default 0;

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

create index if not exists teacher_workspaces_email_idx
  on public.teacher_workspaces (email);

create index if not exists teacher_workspaces_updated_idx
  on public.teacher_workspaces (updated_at desc);

-- Dedicated student workspace (keeps teacher_workspaces for teachers only)
create table if not exists public.student_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table public.student_workspaces add column if not exists email text;
alter table public.student_workspaces add column if not exists full_name text;
alter table public.student_workspaces enable row level security;
drop policy if exists "Own student workspace read" on public.student_workspaces;
create policy "Own student workspace read" on public.student_workspaces
  for select using (auth.uid() = user_id);
drop policy if exists "Own student workspace upsert" on public.student_workspaces;
create policy "Own student workspace upsert" on public.student_workspaces
  for insert with check (auth.uid() = user_id);
drop policy if exists "Own student workspace update" on public.student_workspaces;
create policy "Own student workspace update" on public.student_workspaces
  for update using (auth.uid() = user_id);
drop policy if exists "Own student workspace delete" on public.student_workspaces;
create policy "Own student workspace delete" on public.student_workspaces
  for delete using (auth.uid() = user_id);
