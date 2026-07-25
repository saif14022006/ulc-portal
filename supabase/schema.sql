-- ULC Portal · Supabase schema
-- Run this in Supabase → SQL Editor after creating your project.
-- Then paste Project URL + anon key into js/config.js

-- Profiles (roll number is the login id)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  roll_no text unique not null,
  full_name text not null,
  contact text not null,
  current_semester int,
  session text,
  prev_gpa numeric,
  cgpa numeric,
  notes text,
  profile_complete boolean default false,
  created_at timestamptz default now()
);

-- Award lists per subject (matches official ULC award list columns)
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

alter table public.profiles enable row level security;
alter table public.award_lists enable row level security;

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

-- Optional: allow signup with roll as email alias
-- In Authentication → Providers → Email: turn OFF "Confirm email"
-- so students can sign up with roll number immediately.
-- The app maps roll 1027 → 1027@students.ulc.local for Auth.
