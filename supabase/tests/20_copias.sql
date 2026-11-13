-- Pruebas de v0.2.0: datos de prueba, exportar y restaurar copias.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create function pg_temp.debe_fallar(sentencia text, descripcion text) returns void
language plpgsql as $$
begin
  begin
    execute sentencia;
  exception when others then
    raise notice 'OK (rechazado): %', descripcion;
    return;
  end;
  raise exception 'FALLO: debería haberse rechazado: %', descripcion;
end $$;
grant execute on function pg_temp.debe_fallar(text, text) to authenticated;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

-- 1. Datos de prueba: importación propia y borrado en cascada
do $$
declare
  imp uuid;
  antes int;
begin
  select count(*) into antes from public.movimientos;
  insert into public.importaciones (cuenta_id, origen, movimientos_nuevos)
    select id, 'datos_prueba', 2 from public.cuentas where alias = 'Cuenta principal'
    returning id into imp;
  insert into public.movimientos (cuenta_id, importacion_id, fecha_operacion, concepto_original, concepto_limpio, concepto_normalizado, importe)
    select id, imp, '2026-10-05', 'MERCADONA', 'Mercadona', 'mercadona', -52.30 from public.cuentas where alias = 'Cuenta principal';
  insert into public.movimientos (cuenta_id, importacion_id, fecha_operacion, concepto_original, concepto_limpio, concepto_normalizado, importe)
    select id, imp, '2026-10-28', 'NOMINA', 'Nómina', 'nomina', 3200 from public.cuentas where alias = 'Cuenta principal';
  assert (select count(*) from public.movimientos) = antes + 2, 'dos movimientos de prueba';
  delete from public.importaciones where origen = 'datos_prueba';
  assert (select count(*) from public.movimientos) = antes, 'borrar la importación de prueba borra sus movimientos';
  raise notice 'OK: datos de prueba se borran por completo';
end $$;

-- 2. Exportar, cambiar y restaurar
create temp table copia_a as select public.exportar_copia() as c;
do $$
declare
  c jsonb := (select c from copia_a);
  n_cat int := (select count(*) from public.categorias);
  n_mov int := (select count(*) from public.movimientos);
  r jsonb;
begin
  assert c->>'app' = 'puchifin', 'marca de la app';
  assert jsonb_array_length(c->'datos'->'cuentas') = 4, 'cuatro cuentas en la copia';
  assert not (c->'datos'->'cuentas'->0) ? 'user_id', 'la copia no lleva user_id';

  -- Cambios después de la copia
  delete from public.categorias where nombre = 'Hijos' and padre_id is null;
  update public.cuentas set alias = 'Cambiada' where alias = 'Cuenta 2';
  insert into public.cuentas (alias, tipo) values ('Nueva', 'cuenta');

  r := public.restaurar_copia(c);
  assert (select count(*) from public.categorias) = n_cat, 'categorías restauradas';
  assert (select count(*) from public.movimientos) = n_mov, 'movimientos restaurados';
  assert (select count(*) from public.cuentas) = 4, 'cuentas como en la copia';
  assert exists (select 1 from public.cuentas where alias = 'Cuenta 2'), 'alias original de vuelta';
  assert (r->>'categorias')::int = n_cat, 'resumen de la restauración';
  raise notice 'OK: exportar y restaurar copia';
end $$;

-- 3. Copias no válidas: no cambian nada
select pg_temp.debe_fallar($$select public.restaurar_copia('{"app":"tareas","datos":{}}')$$, 'copia de otra app');
select pg_temp.debe_fallar($$select public.restaurar_copia('{"app":"puchifin","esquema":99,"datos":{}}')$$, 'copia de un esquema más reciente');
do $$
declare
  c jsonb := (select c from copia_a);
  n int := (select count(*) from public.cuentas);
begin
  -- Una copia con un IBAN dentro falla entera y deja los datos como estaban
  c := jsonb_set(c, '{datos,cuentas,0,alias}', '"ES91 2100 0418 4502 0005 1332"');
  begin
    perform public.restaurar_copia(c);
    raise exception 'FALLO: la copia con IBAN debería rechazarse';
  exception when check_violation then
    null;
  end;
  assert (select count(*) from public.cuentas) = n, 'sin cambios tras el fallo';
  raise notice 'OK: una copia con datos identificativos no se restaura y no cambia nada';
end $$;

-- 4. Otro usuario no ve la copia de A ni puede escribir en A al restaurar
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$
declare
  c jsonb := (select c from copia_a);
begin
  assert jsonb_array_length(public.exportar_copia()->'datos'->'cuentas') = 0, 'B exporta solo lo suyo';
  -- Los identificadores de la copia son de A: la restauración falla entera y no toca nada de A
  begin
    perform public.restaurar_copia(c);
    raise exception 'FALLO: B no debería poder restaurar filas con identificadores de A';
  exception when unique_violation then
    null;
  end;
  assert (select count(*) from public.cuentas) = 0, 'B sigue sin datos';
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.cuentas where user_id = '00000000-0000-0000-0000-00000000000a') = 4, 'A no cambia';
  raise notice 'OK: restaurar solo afecta a la cuenta con sesión';
end $$;
