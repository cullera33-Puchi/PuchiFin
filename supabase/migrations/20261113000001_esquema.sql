-- PuchiFin. Fase 1: modelo de datos completo.
-- Nueve tablas de la especificación (apartado 4) más la tabla de ajustes.
-- Ninguna tabla guarda número de cuenta, IBAN, tarjeta ni DNI: los textos libres
-- llevan una comprobación (contiene_dato_identificativo) como última barrera.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Detección de datos identificativos (misma lógica que src/lib/identificativos.ts)
-- ---------------------------------------------------------------------------

create or replace function public.luhn_valido(digitos text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  suma int := 0;
  d int;
  doble boolean := false;
  i int;
begin
  for i in reverse length(digitos)..1 loop
    d := substr(digitos, i, 1)::int;
    if doble then
      d := d * 2;
      if d > 9 then d := d - 9; end if;
    end if;
    suma := suma + d;
    doble := not doble;
  end loop;
  return suma % 10 = 0;
end;
$$;

create or replace function public.contiene_dato_identificativo(texto text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  t text;
  m text[];
  compacto text;
  letras constant text := 'TRWAGMYFPDXBNJZSQVHLCKE';
  num bigint;
begin
  if texto is null or texto = '' then
    return false;
  end if;
  t := upper(texto);

  -- IBAN: código de país, dígitos de control, un bloque libre (código de banco) y bloques
  -- que empiezan por dígito; al menos 10 dígitos tras el código de país.
  for m in
    select regexp_matches(t, '(?<![A-Z0-9])[A-Z]{2}[0-9]{2}[ -]?[A-Z0-9]{4}(?:[ -]?[0-9][A-Z0-9]{3}){1,6}(?:[ -]?[0-9][A-Z0-9]{0,3})?(?![A-Z0-9])', 'g')
  loop
    compacto := regexp_replace(m[1], '[ -]', '', 'g');
    if length(compacto) >= 15
       and length(regexp_replace(substr(compacto, 5), '[^0-9]', '', 'g')) >= 10 then
      return true;
    end if;
  end loop;

  -- Series de dígitos: 20 dígitos (cuenta CCC) o 13 a 19 con Luhn (tarjeta).
  for m in
    select regexp_matches(t, '(?<![0-9])[0-9](?:[ -]?[0-9]){12,23}(?![0-9])', 'g')
  loop
    compacto := regexp_replace(m[1], '[ -]', '', 'g');
    if length(compacto) = 20 then
      return true;
    end if;
    if length(compacto) between 13 and 19 and public.luhn_valido(compacto) then
      return true;
    end if;
  end loop;

  -- DNI: 8 dígitos y letra de control válida.
  for m in
    select regexp_matches(t, '(?<![A-Z0-9])([0-9]{8})[ -]?([A-Z])(?![A-Z0-9])', 'g')
  loop
    num := m[1]::bigint;
    if substr(letras, (num % 23)::int + 1, 1) = m[2] then
      return true;
    end if;
  end loop;

  -- NIE: X, Y o Z, 7 dígitos y letra de control válida.
  for m in
    select regexp_matches(t, '(?<![A-Z0-9])([XYZ])[ -]?([0-9]{7})[ -]?([A-Z])(?![A-Z0-9])', 'g')
  loop
    num := (case m[1] when 'X' then '0' when 'Y' then '1' else '2' end || m[2])::bigint;
    if substr(letras, (num % 23)::int + 1, 1) = m[3] then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type public.tipo_cuenta as enum ('cuenta', 'tarjeta_credito', 'hipoteca');

create type public.tipo_movimiento as enum (
  'normal',
  'gasto_empleado',
  'reembolso_empresa',
  'traspaso_interno',
  'pago_deuda'
);

create type public.origen_importacion as enum ('bbva_cuenta', 'bbva_tarjeta', 'fintonic');

create type public.estado_importacion as enum ('confirmada', 'deshecha');

create type public.origen_regla as enum ('manual', 'aprendida', 'sistema');

create type public.tipo_patron as enum ('contiene', 'empieza', 'exacto', 'regex');

-- ---------------------------------------------------------------------------
-- Función común para updated_at
-- ---------------------------------------------------------------------------

create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- ajustes: una fila por usuario
-- ---------------------------------------------------------------------------

create table public.ajustes (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  fecha_inicio date not null default '2026-10-01',
  fecha_corte_fintonic date not null default '2026-09-30',
  -- Alias de terceros: [{ "alias": "Empresa", "patrones": ["..."] }, ...]
  alias_terceros jsonb not null default '[
    {"alias": "Empresa", "patrones": []},
    {"alias": "Familia", "patrones": []},
    {"alias": "Otros", "patrones": []}
  ]'::jsonb,
  dias_aviso_reembolso int not null default 60 check (dias_aviso_reembolso > 0),
  umbral_aviso_presupuesto numeric(5, 2) not null default 80 check (umbral_aviso_presupuesto between 1 and 100),
  -- Localidades consideradas "zona de casa" para sugerir gastos de empleado
  zona_casa jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint ajustes_corte_anterior_inicio check (fecha_corte_fintonic < fecha_inicio),
  constraint ajustes_sin_identificativos check (
    not public.contiene_dato_identificativo(alias_terceros::text)
    and not public.contiene_dato_identificativo(zona_casa::text)
  )
);

create trigger ajustes_updated_at before update on public.ajustes
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------------
-- cuentas: solo alias, nunca números
-- ---------------------------------------------------------------------------

create table public.cuentas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  alias text not null check (length(trim(alias)) between 1 and 40),
  entidad text check (entidad is null or length(trim(entidad)) between 1 and 40),
  tipo public.tipo_cuenta not null,
  activa boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cuentas_alias_unico unique (user_id, alias),
  constraint cuentas_sin_identificativos check (
    not public.contiene_dato_identificativo(alias)
    and not public.contiene_dato_identificativo(entidad)
    -- Un alias no puede ser una serie larga de dígitos (número de cuenta o tarjeta parcial)
    and alias !~ '[0-9]{6,}'
  )
);

create trigger cuentas_updated_at before update on public.cuentas
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------------
-- categorias: dos niveles (categoría y subcategoría)
-- ---------------------------------------------------------------------------

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  padre_id uuid references public.categorias (id) on delete cascade,
  nombre text not null check (length(trim(nombre)) between 1 and 60),
  icono text,
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  naturaleza text not null default 'gasto' check (naturaleza in ('gasto', 'ingreso')),
  activa boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  constraint categorias_no_es_su_padre check (padre_id is null or padre_id <> id)
);

-- Nombre único por nivel (nulls not distinct para las categorías raíz)
create unique index categorias_nombre_unico
  on public.categorias (user_id, padre_id, lower(nombre)) nulls not distinct;

create index categorias_padre on public.categorias (padre_id);

-- Solo dos niveles: una subcategoría no puede tener hijas.
-- La subcategoría hereda la naturaleza de su categoría.
create or replace function public.validar_categoria()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  padre record;
begin
  if new.padre_id is not null then
    select padre_id, naturaleza, user_id into padre
      from public.categorias where id = new.padre_id;
    if padre.padre_id is not null then
      raise exception 'Solo se admiten dos niveles: categoría y subcategoría';
    end if;
    if padre.user_id <> new.user_id then
      raise exception 'La categoría padre pertenece a otro usuario';
    end if;
    new.naturaleza := padre.naturaleza;
  end if;
  return new;
end;
$$;

create trigger categorias_validar before insert or update on public.categorias
  for each row execute function public.validar_categoria();

-- ---------------------------------------------------------------------------
-- importaciones
-- ---------------------------------------------------------------------------

create table public.importaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cuenta_id uuid not null references public.cuentas (id) on delete restrict,
  origen public.origen_importacion not null,
  -- No se guarda el nombre del fichero: puede contener el número de cuenta.
  fecha_desde date,
  fecha_hasta date,
  movimientos_nuevos int not null default 0,
  movimientos_duplicados int not null default 0,
  movimientos_descartados int not null default 0,
  estado public.estado_importacion not null default 'confirmada',
  created_at timestamptz not null default now(),
  deshecha_at timestamptz
);

create index importaciones_usuario on public.importaciones (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- reglas
-- ---------------------------------------------------------------------------

create table public.reglas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text,
  patron text not null check (length(trim(patron)) > 0),
  tipo_patron public.tipo_patron not null default 'contiene',
  cuenta_id uuid references public.cuentas (id) on delete cascade,
  importe_min numeric(14, 2),
  importe_max numeric(14, 2),
  categoria_id uuid references public.categorias (id) on delete cascade,
  tipo_movimiento public.tipo_movimiento,
  -- Las sugerencias (por ejemplo, gasto de empleado) piden confirmación antes de aplicarse.
  es_sugerencia boolean not null default false,
  prioridad int not null default 100,
  origen public.origen_regla not null default 'manual',
  activa boolean not null default true,
  confirmaciones int not null default 0,
  descartes int not null default 0,
  created_at timestamptz not null default now(),
  constraint reglas_asigna_algo check (categoria_id is not null or tipo_movimiento is not null),
  constraint reglas_rango_importe check (importe_min is null or importe_max is null or importe_min <= importe_max),
  constraint reglas_sin_identificativos check (
    not public.contiene_dato_identificativo(patron)
    and not public.contiene_dato_identificativo(nombre)
  )
);

create index reglas_usuario on public.reglas (user_id, activa, prioridad);

-- ---------------------------------------------------------------------------
-- movimientos
-- ---------------------------------------------------------------------------

create table public.movimientos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cuenta_id uuid not null references public.cuentas (id) on delete restrict,
  importacion_id uuid references public.importaciones (id) on delete cascade,
  fecha_operacion date not null,
  fecha_valor date,
  concepto_original text not null,          -- ya anonimizado en el navegador
  concepto_limpio text not null,
  concepto_normalizado text not null,       -- forma usada en la deduplicación
  ocurrencia smallint not null default 1 check (ocurrencia >= 1),
  importe numeric(14, 2) not null,          -- negativo gasto, positivo ingreso
  saldo numeric(14, 2),                     -- saldo tras la operación, si el fichero lo trae
  categoria_id uuid references public.categorias (id) on delete set null,
  tipo public.tipo_movimiento not null default 'normal',
  regla_id uuid references public.reglas (id) on delete set null,
  origen_categoria text check (origen_categoria in ('regla', 'aprendida', 'manual')),
  nota text,
  -- Gasto de empleado cerrado a mano (reembolso parcial o sin reembolso)
  reembolso_cerrado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint movimientos_sin_identificativos check (
    not public.contiene_dato_identificativo(concepto_original)
    and not public.contiene_dato_identificativo(concepto_limpio)
    and not public.contiene_dato_identificativo(nota)
  )
);

-- Clave de deduplicación: cuenta, fecha de operación, importe y concepto normalizado,
-- más el número de repetición dentro del fichero (dos cafés iguales el mismo día).
create unique index movimientos_dedup
  on public.movimientos (user_id, cuenta_id, fecha_operacion, importe, concepto_normalizado, ocurrencia);

create index movimientos_fecha on public.movimientos (user_id, fecha_operacion desc);
create index movimientos_categoria on public.movimientos (categoria_id);
create index movimientos_importacion on public.movimientos (importacion_id);
create index movimientos_tipo on public.movimientos (user_id, tipo);

create trigger movimientos_updated_at before update on public.movimientos
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------------
-- conciliaciones: reembolso de empresa frente a gastos de empleado
-- ---------------------------------------------------------------------------

create table public.conciliaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reembolso_id uuid not null references public.movimientos (id) on delete cascade,
  gasto_id uuid not null references public.movimientos (id) on delete cascade,
  importe_aplicado numeric(14, 2) not null check (importe_aplicado > 0),
  created_at timestamptz not null default now(),
  constraint conciliaciones_par_unico unique (reembolso_id, gasto_id)
);

create index conciliaciones_gasto on public.conciliaciones (gasto_id);

-- ---------------------------------------------------------------------------
-- presupuestos
-- ---------------------------------------------------------------------------

create table public.presupuestos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  categoria_id uuid not null references public.categorias (id) on delete cascade,
  importe_mensual numeric(14, 2) not null check (importe_mensual >= 0),
  -- Excepciones por mes: { "2027-08": 2500, "2027-09": 900 }
  excepciones jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint presupuestos_categoria_unica unique (user_id, categoria_id)
);

-- ---------------------------------------------------------------------------
-- compromisos: deuda familiar y regla de pago
-- ---------------------------------------------------------------------------

create table public.compromisos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null,
  deuda_inicial numeric(14, 2) not null check (deuda_inicial >= 0),
  fecha_referencia date not null,
  interes_anual numeric(6, 3) not null default 0 check (interes_anual >= 0),
  colchon numeric(14, 2) not null default 0 check (colchon >= 0),
  base_colchon text not null default 'saldo_conjunto' check (base_colchon in ('saldo_conjunto', 'cuenta_principal')),
  ventana_mes_inicio smallint not null default 6 check (ventana_mes_inicio between 1 and 12),
  ventana_mes_fin smallint not null default 8 check (ventana_mes_fin between 1 and 12),
  mes_referencia smallint not null default 7 check (mes_referencia between 1 and 12),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint compromisos_sin_identificativos check (not public.contiene_dato_identificativo(nombre))
);

-- ---------------------------------------------------------------------------
-- eventos_previstos: gastos o ingresos puntuales conocidos
-- ---------------------------------------------------------------------------

create table public.eventos_previstos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha date not null,
  concepto text not null,
  importe numeric(14, 2) not null,
  categoria_id uuid references public.categorias (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint eventos_sin_identificativos check (not public.contiene_dato_identificativo(concepto))
);

create index eventos_fecha on public.eventos_previstos (user_id, fecha);
