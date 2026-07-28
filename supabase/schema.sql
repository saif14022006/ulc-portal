-- ULC Portal · Supabase schema
-- Run this in Supabase → SQL Editor after creating your project.
-- Then paste Project URL + anon key into js/config.js

-- Profiles (roll number / staff ID is the login id)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  roll_no text unique not null,
  full_name text not null,
  contact text not null, -- stores account email address
  role text not null default 'student' check (role in ('student', 'teacher')),
  current_semester int,
  session text,
  prev_gpa numeric,
  cgpa numeric,
  notes text,
  profile_complete boolean default false,
  created_at timestamptz default now()
);

-- If profiles already exists without role:
alter table public.profiles add column if not exists role text default 'student';

-- Award lists per subject (student accounts only — matches official ULC award list columns)
create table if not exists public.award_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  semester int not null check (semester between 1 and 10),
  subject_code text,
  subject_name text not null,
  teacher text,
  q1 numeric default 0,
  q2 numeric default 0,
  q3 numeric default 0,
  q4 numeric default 0,
  q5 numeric default 0,
  a1 numeric default 0,
  a2 numeric default 0,
  mid_obj numeric default 0,
  mid_sub numeric default 0,
  mid numeric default 0,
  fin_obj numeric default 0,
  fin_sub numeric default 0,
  final numeric default 0,
  notes text,
  updated_at timestamptz default now()
);

create index if not exists award_lists_user_idx on public.award_lists(user_id);

-- Teacher workspace: classes, roster, attendance, marks — private to that teacher only
-- (never shared to student award_lists). View in Table Editor → teacher_workspaces
create table if not exists public.teacher_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  official_name text,
  class_count integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.award_lists enable row level security;
alter table public.teacher_workspaces enable row level security;

create policy "Own profile read" on public.profiles
  for select using (auth.uid() = id);
create policy "Own profile upsert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "Own profile update" on public.profiles
  for update using (auth.uid() = id);

create policy "Own awards read" on public.award_lists
  for select using (auth.uid() = user_id);
create policy "Own awards insert" on public.award_lists
  for insert with check (auth.uid() = user_id);
create policy "Own awards update" on public.award_lists
  for update using (auth.uid() = user_id);
create policy "Own awards delete" on public.award_lists
  for delete using (auth.uid() = user_id);

create policy "Own teacher workspace read" on public.teacher_workspaces
  for select using (auth.uid() = user_id);
create policy "Own teacher workspace upsert" on public.teacher_workspaces
  for insert with check (auth.uid() = user_id);
create policy "Own teacher workspace update" on public.teacher_workspaces
  for update using (auth.uid() = user_id);
create policy "Own teacher workspace delete" on public.teacher_workspaces
  for delete using (auth.uid() = user_id);

-- Shared instructor names for assignment cover pages (students can pick these)
create table if not exists public.instructors (
  id uuid primary key default gen_random_uuid(),
  official_name text unique not null,
  updated_at timestamptz default now()
);

alter table public.instructors enable row level security;

create policy "Anyone can read instructors" on public.instructors
  for select using (true);
create policy "Authenticated can insert instructors" on public.instructors
  for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update instructors" on public.instructors
  for update using (auth.role() = 'authenticated');
