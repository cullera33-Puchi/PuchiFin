-- PuchiFin. Fase 1: acceso restringido a una sola cuenta y Row Level Security.

-- ---------------------------------------------------------------------------
-- Lista de correos autorizados (esquema privado, no expuesto por la API)
-- ---------------------------------------------------------------------------
-- El correo NO va en el repositorio. Se da de alta desde el editor SQL de Supabase:
--   insert into privado.correos_autorizados (correo) values ('tu.correo@gmail.com');

create schema if not exists privado;
revoke all on schema privado from public;

create table privado.correos_autorizados (
  correo text primary key check (correo = lower(trim(correo)) and correo like '%@%'),
  created_at timestamptz not null default now()
);

revoke all on privado.correos_autorizados from public;

-- Bloquea la creación de cualquier usuario cuyo correo no esté autorizado,
-- también los que entran por primera vez con Google.
create or replace function privado.comprobar_correo_autorizado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or not exists (
    select 1 from privado.correos_autorizados a where a.correo = lower(new.email)
  ) then
    raise exception 'Cuenta no autorizada para PuchiFin'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function privado.comprobar_correo_autorizado() from public;

create trigger puchifin_solo_correo_autorizado
  before insert on auth.users
  for each row execute function privado.comprobar_correo_autorizado();

-- ---------------------------------------------------------------------------
-- Row Level Security: cada fila ligada a su usuario, sin acceso anónimo
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'ajustes', 'cuentas', 'categorias', 'importaciones', 'reglas', 'movimientos',
    'conciliaciones', 'presupuestos', 'compromisos', 'eventos_previstos'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_leer', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_crear', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_modificar', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_borrar', t);
  end loop;
end;
$$;

-- Las funciones de detección son de uso interno y del frontal (verificación final).
revoke all on function public.luhn_valido(text) from public, anon;
revoke all on function public.contiene_dato_identificativo(text) from public, anon;
grant execute on function public.luhn_valido(text) to authenticated;
grant execute on function public.contiene_dato_identificativo(text) to authenticated;
