-- Simulación mínima de lo que Supabase ya trae (esquema auth, roles y auth.uid()).
-- Solo para probar las migraciones en un Postgres local. No se aplica en Supabase.
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create role anon nologin;
create role authenticated nologin;
grant usage on schema public, auth to anon, authenticated;
