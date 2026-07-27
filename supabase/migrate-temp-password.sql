-- ULC Toolkit · temporary password reset (BACKUP — no email)
-- Preferred path: Edge Function supabase/functions/send-temp-password
--   (emails the temp password via Resend). Keep this RPC as a fallback
--   so the app can still show a temp password if the function is down.
-- Run once in Supabase → SQL Editor if you want the SQL fallback.
-- Greets the user by name and returns a NEW temporary password to the app.
-- (Old passwords cannot be emailed — they are hashed.)

create extension if not exists pgcrypto;

create table if not exists public.password_reset_throttle (
  email text primary key,
  last_request timestamptz not null default now()
);

alter table public.password_reset_throttle enable row level security;
revoke all on table public.password_reset_throttle from public, anon, authenticated;

create or replace function public.request_temp_password(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_id uuid;
  v_name text;
  v_temp text;
  v_email text;
  v_last timestamptz;
  v_suffix text;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Enter a valid email address.';
  end if;

  select last_request into v_last
  from public.password_reset_throttle
  where email = v_email;

  if v_last is not null and v_last > now() - interval '60 seconds' then
    raise exception 'Please wait a minute before requesting another password.';
  end if;

  select id, full_name into v_id, v_name
  from public.profiles
  where lower(contact) = v_email
  limit 1;

  if v_id is null then
    select u.id,
           coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), 'there')
      into v_id, v_name
    from auth.users u
    where lower(u.email) = v_email
    limit 1;
  end if;

  if v_id is null then
    raise exception 'No account found for this email.';
  end if;

  v_name := coalesce(nullif(trim(v_name), ''), 'there');
  v_suffix := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
  v_temp := 'Ulc-' || v_suffix || lpad((1000 + floor(random() * 9000)::int)::text, 4, '0');

  update auth.users
  set
    encrypted_password = crypt(v_temp, gen_salt('bf')),
    updated_at = now()
  where id = v_id;

  insert into public.password_reset_throttle(email, last_request)
  values (v_email, now())
  on conflict (email) do update set last_request = excluded.last_request;

  return jsonb_build_object(
    'ok', true,
    'name', v_name,
    'email', v_email,
    'tempPassword', v_temp,
    'emailed', false,
    'message', format('Hello, %s! Your temporary password is ready.', v_name)
  );
end;
$$;

revoke all on function public.request_temp_password(text) from public;
grant execute on function public.request_temp_password(text) to anon, authenticated;
