-- Pruebas de la fase 1 sobre las migraciones: acceso, RLS, carga inicial y barreras.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

-- Función auxiliar: falla si la sentencia NO da error
-- y, si se indica, comprueba el código de error esperado
create function pg_temp.debe_fallar(sentencia text, descripcion text, codigo text default null) returns void
language plpgsql as $$
begin
  begin
    execute sentencia;
  exception when others then
    if codigo is not null and sqlstate <> codigo then
      raise exception 'FALLO: % dio el error % (%), se esperaba %', descripcion, sqlstate, sqlerrm, codigo;
    end if;
    raise notice 'OK (rechazado): %', descripcion;
    return;
  end;
  raise exception 'FALLO: debería haberse rechazado: %', descripcion;
end $$;
grant execute on function pg_temp.debe_fallar(text, text, text) to authenticated;

-- 1. Acceso restringido a correos autorizados
insert into privado.correos_autorizados values ('usuario@example.com'), ('pruebas@example.com');
insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'Usuario@Example.com');
insert into auth.users values ('00000000-0000-0000-0000-00000000000b', 'pruebas@example.com');
select pg_temp.debe_fallar(
  $$insert into auth.users values ('00000000-0000-0000-0000-0000000000ff', 'intruso@example.com')$$,
  'alta de un correo no autorizado', '42501');

-- 2. Carga inicial como usuario A
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

do $$
begin
  assert public.inicializar_datos_usuario() = true, 'la primera carga debe devolver true';
  assert public.inicializar_datos_usuario() = false, 'la segunda carga no debe repetir datos';
  assert (select count(*) from public.ajustes) = 1, 'una fila de ajustes';
  assert (select count(*) from public.cuentas) = 4, 'cuatro cuentas por alias';
  assert (select count(*) from public.categorias where padre_id is null) = 14, '14 categorías';
  assert (select count(*) from public.categorias where padre_id is not null) = 45, '45 subcategorías';
  assert (select count(*) from public.categorias where naturaleza = 'ingreso') = 3, 'Ingresos y sus 2 subcategorías';
  assert (select deuda_inicial from public.compromisos) = 0, 'deuda inicial sin importe';
  raise notice 'OK: carga inicial (ajustes, 4 cuentas, 14 categorías, 45 subcategorías, deuda)';
end $$;

-- 3. Barreras contra datos identificativos
select pg_temp.debe_fallar(
  $$insert into public.cuentas (alias, tipo) values ('ES91 2100 0418 4502 0005 1332', 'cuenta')$$,
  'alias con IBAN', '23514');
select pg_temp.debe_fallar(
  $$insert into public.cuentas (alias, tipo) values ('Cuenta 0200051332', 'cuenta')$$,
  'alias con serie larga de dígitos', '23514');
select pg_temp.debe_fallar(
  $$insert into public.movimientos (cuenta_id, fecha_operacion, concepto_original, concepto_limpio, concepto_normalizado, importe)
    select id, '2026-10-02', 'COMPRA TARJ 4111 1111 1111 1111', 'COMPRA', 'compra', -10 from public.cuentas limit 1$$,
  'movimiento con número de tarjeta', '23514');
select pg_temp.debe_fallar(
  $$insert into public.movimientos (cuenta_id, fecha_operacion, concepto_original, concepto_limpio, concepto_normalizado, importe, nota)
    select id, '2026-10-02', 'COMPRA', 'COMPRA', 'compra', -10, 'DNI 12345678Z' from public.cuentas limit 1$$,
  'nota con DNI', '23514');
select pg_temp.debe_fallar(
  $$update public.ajustes set alias_terceros = '[{"alias":"Familia","patrones":["X1234567L"]}]'$$,
  'ajustes con NIE', '23514');

-- 4. Deduplicación: misma clave solo con distinta ocurrencia
insert into public.movimientos (cuenta_id, fecha_operacion, concepto_original, concepto_limpio, concepto_normalizado, importe)
  select id, '2026-10-03', 'CAFETERIA LUNA', 'Cafetería Luna', 'cafeteria luna', -1.80 from public.cuentas where alias = 'Tarjeta';
insert into public.movimientos (cuenta_id, fecha_operacion, concepto_original, concepto_limpio, concepto_normalizado, importe, ocurrencia)
  select id, '2026-10-03', 'CAFETERIA LUNA', 'Cafetería Luna', 'cafeteria luna', -1.80, 2 from public.cuentas where alias = 'Tarjeta';
select pg_temp.debe_fallar(
  $$insert into public.movimientos (cuenta_id, fecha_operacion, concepto_original, concepto_limpio, concepto_normalizado, importe)
    select id, '2026-10-03', 'CAFETERIA LUNA', 'Cafetería Luna', 'cafeteria luna', -1.80 from public.cuentas where alias = 'Tarjeta'$$,
  'movimiento duplicado', '23505');

-- 5. Categorías: dos niveles como máximo y fusión
select pg_temp.debe_fallar(
  $$insert into public.categorias (nombre, padre_id)
    select 'Nieta', id from public.categorias where nombre = 'Luz'$$,
  'tercer nivel de categoría');

do $$
declare
  origen uuid;
  destino uuid;
begin
  insert into public.categorias (nombre, naturaleza) values ('Mascotas', 'gasto') returning id into origen;
  insert into public.categorias (nombre, padre_id) values ('Veterinario', origen);
  select id into destino from public.categorias where nombre = 'Salud' and padre_id is null;
  update public.movimientos set categoria_id = origen where concepto_normalizado = 'cafeteria luna';
  perform public.fusionar_categoria(origen, destino);
  assert not exists (select 1 from public.categorias where id = origen), 'el origen se borra';
  assert (select count(*) from public.movimientos where categoria_id = destino) = 2, 'movimientos reasignados';
  assert exists (select 1 from public.categorias where nombre = 'Veterinario' and padre_id = destino), 'subcategoría movida';
  raise notice 'OK: fusión de categorías';
end $$;

-- 6. RLS: el usuario B no ve nada de A ni puede escribir en su nombre
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$
begin
  assert (select count(*) from public.categorias) = 0, 'B no ve categorías de A';
  assert (select count(*) from public.movimientos) = 0, 'B no ve movimientos de A';
  assert (select count(*) from public.ajustes) = 0, 'B no ve ajustes de A';
  raise notice 'OK: RLS en lectura';
end $$;
select pg_temp.debe_fallar(
  $$insert into public.cuentas (user_id, alias, tipo) values ('00000000-0000-0000-0000-00000000000a', 'Intrusa', 'cuenta')$$,
  'escritura con user_id de otro usuario', '42501');
update public.cuentas set alias = 'Cambiada' where alias = 'Cuenta principal';
reset role;
do $$
begin
  assert exists (select 1 from public.cuentas where alias = 'Cuenta principal'), 'B no puede modificar cuentas de A';
  raise notice 'OK: RLS en escritura';
end $$;

-- 7. Sin acceso anónimo
set role anon;
select pg_temp.debe_fallar($$select * from public.movimientos$$, 'lectura anónima', '42501');
select pg_temp.debe_fallar($$select * from privado.correos_autorizados$$, 'lectura anónima de correos autorizados');
reset role;
set role authenticated;
select pg_temp.debe_fallar($$select * from privado.correos_autorizados$$, 'lectura de correos autorizados por un usuario');
reset role;

-- 8. Todas las tablas públicas con RLS activo
do $$
declare
  sin_rls text;
begin
  select string_agg(relname, ', ') into sin_rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  assert sin_rls is null, 'tablas sin RLS: ' || coalesce(sin_rls, '');
  raise notice 'OK: RLS activo en todas las tablas públicas';
end $$;
