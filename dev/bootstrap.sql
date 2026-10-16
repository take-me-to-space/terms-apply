-- Local fixture only. Hosted Supabase supplies these roles and auth.uid().
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator login noinherit password :'db_password';
grant anon, authenticated, service_role to authenticator;
create role supabase_auth_admin login password :'db_password';
create schema auth authorization supabase_auth_admin;
alter role supabase_auth_admin set search_path = auth, public;
grant create on database postgres to supabase_auth_admin;
grant usage on schema public, auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid;
$$;
alter function auth.uid() owner to supabase_auth_admin;
grant execute on function auth.uid() to anon, authenticated, service_role;
