-- PuchiFin. Fase 1: datos iniciales y operaciones sobre el catálogo.
--
-- inicializar_datos_usuario() la llama el frontal tras el primer acceso. Es idempotente:
-- si el usuario ya tiene ajustes, no hace nada. Carga:
--   * la fila de ajustes con los valores por defecto,
--   * las cuatro cuentas previstas por alias (sin números),
--   * el catálogo predeterminado de categorías (apartado 5), con la clave del icono
--     (src/componentes/Icono.tsx) y colores de la paleta del sistema de iOS,
--   * el compromiso de la deuda familiar con los valores iniciales (apartado 10).
-- Se ejecuta con los permisos del usuario (security invoker), así que pasa por RLS.

create or replace function public.inicializar_datos_usuario()
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cat record;
  padre uuid;
  sub text;
  i int;
  orden_cat int := 0;
begin
  if uid is null then
    raise exception 'Sin sesión';
  end if;

  if exists (select 1 from public.ajustes where user_id = uid) then
    return false;
  end if;

  insert into public.ajustes (user_id) values (uid);

  insert into public.cuentas (user_id, alias, entidad, tipo, orden) values
    (uid, 'Cuenta principal', 'BBVA', 'cuenta', 1),
    (uid, 'Cuenta 2', 'BBVA', 'cuenta', 2),
    (uid, 'Tarjeta', 'BBVA', 'tarjeta_credito', 3),
    (uid, 'Hipoteca', null, 'hipoteca', 4);

  for cat in
    select * from (values
      ('Vivienda',               'casa', '#FF9500', 'gasto',   array['Hipoteca', 'Comunidad', 'IBI y tasas', 'Seguro de hogar', 'Mantenimiento y reformas']),
      ('Suministros',            'bombilla', '#F7B500', 'gasto',   array['Luz', 'Agua', 'Fibra y móvil']),
      ('Alimentación',           'carrito', '#34C759', 'gasto',   array['Supermercado', 'Mercado y tiendas']),
      ('Restaurantes y ocio',    'cubiertos', '#FF3B30', 'gasto',   array['Restaurantes', 'Cafeterías', 'Ocio', 'Cultura']),
      ('Transporte',             'coche', '#007AFF', 'gasto',   array['Combustible', 'Peajes', 'Aparcamiento', 'Transporte público', 'Mantenimiento del coche']),
      ('Hijos',                  'bebe', '#FF2D55', 'gasto',   array['Colegio', 'Extraescolares', 'Ropa', 'Cuidado']),
      ('Salud',                  'salud', '#30B0C7', 'gasto',   array['Farmacia', 'Seguro médico', 'Consultas']),
      ('Compras',                'bolsa', '#AF52DE', 'gasto',   array['Ropa', 'Hogar', 'Tecnología', 'Regalos']),
      ('Suscripciones',          'repetir', '#5856D6', 'gasto',   array['Plataformas', 'Software', 'Cuotas']),
      ('Viajes',                 'avion', '#32ADE6', 'gasto',   array['Alojamiento', 'Transporte', 'Actividades']),
      ('Seguros',                'escudo', '#8E8E93', 'gasto',   array['Coche', 'Vida', 'Otros']),
      ('Comisiones e intereses', 'banco', '#636366', 'gasto',   array['Comisiones bancarias', 'Intereses de tarjeta']),
      ('Impuestos',              'recibo', '#A2845E', 'gasto',   array['IRPF', 'Otros']),
      ('Ingresos',               'billete', '#00C7BE', 'ingreso', array['Nómina', 'Otros ingresos'])
    ) as c(nombre, icono, color, naturaleza, subcategorias)
  loop
    orden_cat := orden_cat + 1;
    insert into public.categorias (user_id, nombre, icono, color, naturaleza, orden)
      values (uid, cat.nombre, cat.icono, cat.color, cat.naturaleza, orden_cat)
      returning id into padre;

    i := 0;
    foreach sub in array cat.subcategorias loop
      i := i + 1;
      insert into public.categorias (user_id, padre_id, nombre, color, naturaleza, orden)
        values (uid, padre, sub, cat.color, cat.naturaleza, i);
    end loop;
  end loop;

  insert into public.compromisos (
    user_id, nombre, deuda_inicial, fecha_referencia, interes_anual, colchon,
    base_colchon, ventana_mes_inicio, ventana_mes_fin, mes_referencia
  ) values (
    uid, 'Deuda familiar', 0, '2026-10-01', 0, 0,
    'saldo_conjunto', 6, 8, 7
  );

  return true;
end;
$$;

revoke all on function public.inicializar_datos_usuario() from public, anon;
grant execute on function public.inicializar_datos_usuario() to authenticated;

-- ---------------------------------------------------------------------------
-- Fusionar una categoría en otra: reasigna movimientos, reglas, presupuestos,
-- eventos previstos y subcategorías, y borra la de origen.
-- ---------------------------------------------------------------------------

create or replace function public.fusionar_categoria(id_origen uuid, id_destino uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  o record;
  d record;
begin
  if id_origen = id_destino then
    raise exception 'Origen y destino son la misma categoría';
  end if;

  select id, padre_id into o from public.categorias where id = id_origen;
  select id, padre_id into d from public.categorias where id = id_destino;
  if o.id is null or d.id is null then
    raise exception 'Categoría no encontrada';
  end if;
  if d.padre_id = id_origen then
    raise exception 'No se puede fusionar una categoría en una de sus subcategorías';
  end if;

  update public.movimientos set categoria_id = id_destino where categoria_id = id_origen;
  update public.reglas set categoria_id = id_destino where categoria_id = id_origen;
  update public.eventos_previstos set categoria_id = id_destino where categoria_id = id_origen;

  -- Presupuestos: si el id_destino ya tiene uno, se suma el importe mensual.
  update public.presupuestos p
     set importe_mensual = p.importe_mensual + po.importe_mensual
    from public.presupuestos po
   where p.categoria_id = id_destino and po.categoria_id = id_origen;
  delete from public.presupuestos
   where categoria_id = id_origen
     and exists (select 1 from public.presupuestos where categoria_id = id_destino);
  update public.presupuestos set categoria_id = id_destino where categoria_id = id_origen;

  -- Las subcategorías del id_origen pasan al id_destino si este es una categoría raíz;
  -- si el id_destino es subcategoría, sus movimientos ya se han reasignado arriba.
  if d.padre_id is null then
    update public.categorias c
       set padre_id = id_destino
     where c.padre_id = id_origen
       and not exists (
         select 1 from public.categorias x
          where x.padre_id = id_destino and lower(x.nombre) = lower(c.nombre)
       );
  end if;
  -- Subcategorías que no se han podido mover: su contenido va a la subcategoría
  -- homónima del id_destino o, si no existe, al propio id_destino.
  update public.movimientos m
     set categoria_id = coalesce(
       (select x.id from public.categorias x, public.categorias s
         where s.id = m.categoria_id and x.padre_id = id_destino and lower(x.nombre) = lower(s.nombre)),
       id_destino)
   where m.categoria_id in (select id from public.categorias where padre_id = id_origen);
  update public.reglas r
     set categoria_id = coalesce(
       (select x.id from public.categorias x, public.categorias s
         where s.id = r.categoria_id and x.padre_id = id_destino and lower(x.nombre) = lower(s.nombre)),
       id_destino)
   where r.categoria_id in (select id from public.categorias where padre_id = id_origen);
  update public.eventos_previstos e
     set categoria_id = id_destino
   where e.categoria_id in (select id from public.categorias where padre_id = id_origen);

  delete from public.categorias where id = id_origen;
end;
$$;

revoke all on function public.fusionar_categoria(uuid, uuid) from public, anon;
grant execute on function public.fusionar_categoria(uuid, uuid) to authenticated;
