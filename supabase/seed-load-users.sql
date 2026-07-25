-- ULC Portal · bulk seed 1000 students + 1000 teachers
-- Run in Supabase → SQL Editor. Safe to re-run (skips existing emails).
-- Password for every seeded account: LoadTest123!
-- This bypasses Auth email rate limits (postgres path).

create extension if not exists pgcrypto;

do $$
declare
  v_instance uuid;
  v_uid uuid;
  v_email text;
  v_roll text;
  v_name text;
  v_role text;
  i int;
begin
  select id into v_instance from auth.instances limit 1;
  if v_instance is null then
    v_instance := '00000000-0000-0000-0000-000000000000';
  end if;

  for i in 1..1000 loop
    v_email := 'ulc.load.stu.' || lpad(i::text, 4, '0') || '@example.com';
    v_roll := 'S' || lpad(i::text, 4, '0');
    v_name := 'Load Student ' || i::text;
    v_role := 'student';

    if exists (select 1 from auth.users where email = v_email) then
      select id into v_uid from auth.users where email = v_email;
    else
      v_uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token,
        email_change_token_new, email_change
      ) values (
        v_instance, v_uid, 'authenticated', 'authenticated', v_email,
        crypt('LoadTest123!', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('roll_no', v_roll, 'full_name', v_name, 'email', v_email, 'role', v_role),
        now(), now(), '', '', '', ''
      );

      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_uid,
        jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
        'email', v_uid::text,
        now(), now(), now()
      );
    end if;

    insert into public.profiles (id, roll_no, full_name, contact, role, current_semester, profile_complete)
    values (v_uid, v_roll, v_name, v_email, v_role, 3, false)
    on conflict (id) do update set
      roll_no = excluded.roll_no,
      full_name = excluded.full_name,
      contact = excluded.contact,
      role = excluded.role;
  end loop;

  for i in 1..1000 loop
    v_email := 'ulc.load.tch.' || lpad(i::text, 4, '0') || '@example.com';
    v_roll := 'T' || lpad(i::text, 4, '0');
    v_name := 'Load Teacher ' || i::text;
    v_role := 'teacher';

    if exists (select 1 from auth.users where email = v_email) then
      select id into v_uid from auth.users where email = v_email;
    else
      v_uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token,
        email_change_token_new, email_change
      ) values (
        v_instance, v_uid, 'authenticated', 'authenticated', v_email,
        crypt('LoadTest123!', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('roll_no', v_roll, 'full_name', v_name, 'email', v_email, 'role', v_role),
        now(), now(), '', '', '', ''
      );

      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_uid,
        jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
        'email', v_uid::text,
        now(), now(), now()
      );
    end if;

    insert into public.profiles (id, roll_no, full_name, contact, role, profile_complete)
    values (v_uid, v_roll, v_name, v_email, v_role, true)
    on conflict (id) do update set
      roll_no = excluded.roll_no,
      full_name = excluded.full_name,
      contact = excluded.contact,
      role = excluded.role,
      profile_complete = true;
  end loop;
end $$;
