-- FOUNDERS SALES OS · fundaciones
--
-- Quién entra, con qué rol, y el registro de todo lo que se toca.
--
-- RLS prendido y SIN políticas a propósito: la clave anónima de Supabase no
-- puede leer ni escribir nada, ni siquiera si se filtra. A la base se entra por
-- el servidor de la aplicación, con su sesión.

-- ── Quién entra ────────────────────────────────────────────────────────────
create table if not exists usuarios (
  id          bigint generated always as identity primary key,
  email       text not null unique,
  nombre      text not null,
  rol         text not null check (rol in ('admin', 'direccion', 'head', 'closer', 'setter', 'coach')),
  clave_hash  text not null,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

create table if not exists sesiones_login (
  token       text primary key,
  usuario_id  bigint not null references usuarios(id) on delete cascade,
  creado_en   timestamptz not null default now(),
  expira_en   timestamptz not null
);
create index if not exists idx_sesiones_usuario on sesiones_login(usuario_id);

-- ── El equipo ──────────────────────────────────────────────────────────────
-- Un closer y un setter son personas del equipo, no usuarios. Se separan porque
-- puede haber un closer que todavía no tiene cuenta, y porque un closer que se
-- va no se borra: se desactiva, y sus oportunidades quedan.
create table if not exists closers (
  id                bigint generated always as identity primary key,
  usuario_id        bigint references usuarios(id) on delete set null,
  nombre            text not null,
  nombre_pleg       text not null unique,      -- sin acentos ni mayúsculas: no crear dos veces la misma persona
  zona_horaria      text,
  capacidad_semanal integer,                   -- llamadas por semana que puede tomar
  activo            boolean not null default true,
  creado_en         timestamptz not null default now()
);

create table if not exists setters (
  id           bigint generated always as identity primary key,
  usuario_id   bigint references usuarios(id) on delete set null,
  nombre       text not null,
  nombre_pleg  text not null unique,
  activo       boolean not null default true,
  creado_en    timestamptz not null default now()
);

-- ── Catálogos ──────────────────────────────────────────────────────────────
create table if not exists fuentes (
  id      bigint generated always as identity primary key,
  nombre  text not null unique,
  activa  boolean not null default true,
  orden   integer not null default 0
);

create table if not exists funnels (
  id      bigint generated always as identity primary key,
  nombre  text not null unique,
  activo  boolean not null default true,
  orden   integer not null default 0
);

-- ── Configuración sin tocar código (Parte 17) ──────────────────────────────
create table if not exists config (
  clave       text primary key,
  valor       jsonb not null,
  descripcion text,
  usuario_id  bigint references usuarios(id) on delete set null,
  actualizado_en timestamptz not null default now()
);

insert into config (clave, valor, descripcion) values
  ('moneda_base', '"USD"', 'La moneda en la que se leen los números del tablero.'),
  ('dias_habiles_mes', '22', 'Días laborables del mes, para el ritmo esperado del objetivo.')
on conflict (clave) do nothing;

-- ── El audit log (Parte 16) ────────────────────────────────────────────────
-- Todo cambio comercial importante deja rastro: reasignar closer o setter,
-- cambiar un resultado, tocar un importe, dar de baja algo.
create table if not exists cambios (
  id             bigint generated always as identity primary key,
  entidad        text not null,          -- 'lead' | 'oportunidad' | 'venta' | 'sena' | 'config'
  entidad_id     bigint not null,
  campo          text not null,
  valor_anterior text,                   -- null la primera vez que se carga
  valor_nuevo    text,                   -- null cuando se vacía
  motivo         text,
  usuario_id     bigint references usuarios(id) on delete set null,
  creado_en      timestamptz not null default now()
);
create index if not exists idx_cambios_entidad on cambios(entidad, entidad_id, creado_en desc);

-- ── Lo que cuesta plata, anotado ───────────────────────────────────────────
create table if not exists llamadas_modelo (
  id                  bigint generated always as identity primary key,
  lead_id             bigint,
  usuario_id          bigint references usuarios(id) on delete set null,
  para                text not null,
  modelo              text not null,
  tokens_entrada      integer not null default 0,
  tokens_salida       integer not null default 0,
  tokens_cache_leido  integer not null default 0,
  tokens_cache_escrito integer not null default 0,
  costo_usd           numeric(12,6) not null default 0,
  ms                  integer,
  error               text,
  creado_en           timestamptz not null default now()
);
create index if not exists idx_llamadas_modelo_fecha on llamadas_modelo(creado_en desc);

-- ── La cola de trabajos ────────────────────────────────────────────────────
-- Todavía no la drena nadie: la tabla entra ahora para que el esquema no cambie
-- cuando llegue el analizador, que es quien la va a necesitar.
create table if not exists trabajos (
  id             bigint generated always as identity primary key,
  tipo           text not null,
  referencia_id  bigint,
  estado         text not null default 'pendiente' check (estado in ('pendiente','corriendo','hecho','error')),
  progreso       jsonb not null default '{}',
  intentos       integer not null default 0,
  max_intentos   integer not null default 3,
  tomado_hasta   timestamptz,
  error          text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_trabajos_pendientes on trabajos(creado_en)
  where estado in ('pendiente', 'corriendo');

alter table usuarios        enable row level security;
alter table sesiones_login  enable row level security;
alter table closers         enable row level security;
alter table setters         enable row level security;
alter table fuentes         enable row level security;
alter table funnels         enable row level security;
alter table config          enable row level security;
alter table cambios         enable row level security;
alter table llamadas_modelo enable row level security;
alter table trabajos        enable row level security;
