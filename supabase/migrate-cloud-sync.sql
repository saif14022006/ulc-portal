-- ULC Portal · student/teacher cloud sync helpers (safe to re-run)
-- teacher_workspaces already stores teacher classes AND student profile/photo/records (kind in data jsonb)

-- Optional dedicated student table (app works without this — uses teacher_workspaces)
create table if not exists public.student_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
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

-- Optional profile photo URL column (photos also live in workspace JSON)
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists father_name text;
alter table public.profiles add column if not exists cnic text;
alter table public.profiles add column if not exists registration_no text;
