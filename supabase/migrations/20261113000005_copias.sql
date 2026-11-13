-- PuchiFin v0.2.0: copias de seguridad.
--
-- exportar_copia() devuelve en un solo JSON todos los datos del usuario, ya anonimizados
-- (los mismos que hay en Supabase), sin la columna user_id. El frontal la guarda como copia
-- diaria en el dispositivo o como archivo.
--
-- restaurar_copia(copia) sustituye todos los datos del usuario por los de la copia en una sola
-- transacción: si algo falla, no cambia nada. Pasa por RLS (security invoker) y fuerza el
-- user_id del usuario con sesión, así que nunca escribe datos de otra cuenta.

create or replace function public.tablas_copia()
returns text[]
language sql
immutable
set search_path = ''
as $$
  -- Orden de inserción (las referencias van antes que quien las usa)
  select array[
    'ajustes', 'cuentas', 'categorias', 'reglas', 'importaciones', 'movimientos',
    'conciliaciones', 'presupuestos', 'compromisos', 'eventos_previstos'
  ]
$$;

create or replace function public.exportar_copia()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  t text;
  filas jsonb;
  datos jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión';
  end if;
  foreach t in array public.tablas_copia() loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x) - ''user_id''), ''[]''::jsonb) from public.%I x where x.user_id = $1',
      t) into filas using auth.uid();
    datos := datos || jsonb_build_object(t, filas);
  end loop;
  return jsonb_build_object(
    'app', 'puchifin',
    'esquema', 5,
    'exportado', now(),
    'datos', datos
  );
end;
$$;

create or replace function public.restaurar_copia(copia jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  t text;
  tablas text[] := public.tablas_copia();
  filas jsonb;
  resultado jsonb := '{}'::jsonb;
  i int;
begin
  if uid is null then
    raise exception 'Sin sesión';
  end if;
  if copia->>'app' is distinct from 'puchifin' or jsonb_typeof(copia->'datos') is distinct from 'object' then
    raise exception 'El archivo no es una copia de PuchiFin';
  end if;
  if coalesce((copia->>'esquema')::int, 0) > 5 then
    raise exception 'La copia es de una versión más reciente de la app. Actualiza antes de restaurar';
  end if;

  -- Borrado en orden inverso a las referencias
  for i in reverse array_length(tablas, 1)..1 loop
    execute format('delete from public.%I where user_id = $1', tablas[i]) using uid;
  end loop;

  foreach t in array tablas loop
    filas := coalesce(copia->'datos'->t, '[]'::jsonb);
    if jsonb_typeof(filas) <> 'array' then
      raise exception 'Copia dañada: % no es una lista', t;
    end if;
    -- Cada fila pasa a ser del usuario con sesión
    select coalesce(jsonb_agg(f || jsonb_build_object('user_id', uid)), '[]'::jsonb)
      into filas from jsonb_array_elements(filas) f;

    if t = 'categorias' then
      -- Primero las categorías y después las subcategorías (validar_categoria busca al padre)
      insert into public.categorias
        select * from jsonb_populate_recordset(null::public.categorias, filas) where padre_id is null;
      insert into public.categorias
        select * from jsonb_populate_recordset(null::public.categorias, filas) where padre_id is not null;
    else
      execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', t, t)
        using filas;
    end if;
    resultado := resultado || jsonb_build_object(t, jsonb_array_length(filas));
  end loop;

  return resultado;
end;
$$;

revoke all on function public.tablas_copia() from public, anon;
revoke all on function public.exportar_copia() from public, anon;
revoke all on function public.restaurar_copia(jsonb) from public, anon;
grant execute on function public.tablas_copia() to authenticated;
grant execute on function public.exportar_copia() to authenticated;
grant execute on function public.restaurar_copia(jsonb) to authenticated;
