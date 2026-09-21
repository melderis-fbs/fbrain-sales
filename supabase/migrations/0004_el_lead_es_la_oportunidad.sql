-- FOUNDERS SALES OS · el lead es la oportunidad
--
-- El modelo tenía una capa de más. María no es "un lead con dos oportunidades":
-- María ES la oportunidad, y las llamadas que hagan falta para cerrarla —una,
-- dos o tres— cuelgan de ella.
--
-- Esta migración es DESTRUCTIVA con `oportunidades` a propósito: se corrió con
-- la base todavía vacía, antes de cargar la operación. Si alguna vez hay que
-- volver a aplicarla sobre datos reales, hay que reescribirla moviendo las
-- filas, no tirándolas.

-- ── La plata pasa a colgar del lead ────────────────────────────────────────
alter table ventas add column if not exists lead_id bigint references leads(id) on delete cascade;
alter table senias add column if not exists lead_id bigint references leads(id) on delete cascade;
alter table llamadas add column if not exists lead_id bigint references leads(id) on delete cascade;

alter table ventas   drop column if exists oportunidad_id;
alter table senias   drop column if exists oportunidad_id;
alter table llamadas drop column if exists oportunidad_id;

drop table if exists oportunidad_participaciones;
drop table if exists oportunidades;

alter table ventas   alter column lead_id set not null;
alter table senias   alter column lead_id set not null;
alter table llamadas alter column lead_id set not null;

create index if not exists idx_ventas_lead   on ventas(lead_id);
create index if not exists idx_senias_lead   on senias(lead_id);
create index if not exists idx_llamadas_lead on llamadas(lead_id, numero);

-- ── El lead se queda con todo lo comercial ─────────────────────────────────
alter table leads add column if not exists closer_id        bigint references closers(id) on delete set null;
alter table leads add column if not exists closer_inicial_id bigint references closers(id) on delete set null;
alter table leads add column if not exists industria        text;
alter table leads add column if not exists fecha_sesion     date;
alter table leads add column if not exists hora_sesion      time;
alter table leads add column if not exists tipo_sesion      text not null default 'primera'
  check (tipo_sesion in ('primera', 'segunda', 'seguimiento', 'onboarding', 'otra'));
alter table leads add column if not exists estado           text not null default 'agendado'
  check (estado in ('agendado', 'asistio', 'no_show', 'cancelado', 'reagendado'));
alter table leads add column if not exists resultado        text not null default 'pendiente'
  check (resultado in ('pendiente', 'venta', 'sena', 'seguimiento', 'perdida', 'no_calificado'));
alter table leads add column if not exists hubo_oferta      boolean not null default false;
alter table leads add column if not exists motivo_perdida   text;
alter table leads add column if not exists valor_potencial  numeric(14,2);
alter table leads add column if not exists moneda           text not null default 'USD';
alter table leads add column if not exists proximo_contacto date;
alter table leads add column if not exists proximo_paso     text;
alter table leads add column if not exists observaciones    text;

-- ── Ciclos y repesca ───────────────────────────────────────────────────────
-- Un lead que se pierde y vuelve es EL MISMO lead, no uno nuevo: si no, se
-- parte la historia. Pero el ciclo hay que contarlo, porque quien lo reflota
-- cobra por eso — y suele no ser el mismo que después cierra.
alter table leads add column if not exists ciclo          integer not null default 1;
alter table leads add column if not exists reflotado_por  bigint references usuarios(id) on delete set null;
alter table leads add column if not exists reflotado_en   timestamptz;

create index if not exists idx_leads_closer   on leads(closer_id) where borrado_en is null;
create index if not exists idx_leads_sesion   on leads(fecha_sesion) where borrado_en is null;
create index if not exists idx_leads_proximo  on leads(proximo_contacto)
  where borrado_en is null and proximo_contacto is not null;

-- ── Las llamadas, con su tipo de sesión ────────────────────────────────────
alter table llamadas add column if not exists tipo_sesion text not null default 'primera'
  check (tipo_sesion in ('primera', 'segunda', 'seguimiento', 'onboarding', 'otra'));
alter table llamadas add column if not exists resultado text
  check (resultado in ('venta', 'sena', 'seguimiento', 'perdida', 'no_calificado'));
alter table llamadas add column if not exists ciclo integer not null default 1;

-- ── La calificación: lo que el setter averigua antes de la llamada ─────────
-- Vive aparte del lead porque son las entradas del Lead Quality y se completan
-- en otro momento: el alta puede venir de GHL sin nada de esto.
create table if not exists lead_calificacion (
  lead_id              bigint primary key references leads(id) on delete cascade,
  oferta_definida      text,
  facturacion_mensual  text,
  ticket_actual        numeric(14,2),
  tiene_clientes       text,
  problema             text,
  objetivo             text,
  urgencia             integer check (urgencia between 1 and 5),
  es_decisor           text,
  capacidad_inversion  text,
  conciencia           text,
  interes              text,
  observaciones_setter text,
  actualizado_en       timestamptz not null default now(),
  actualizado_por      bigint references usuarios(id) on delete set null
);

-- ── Lead Quality ───────────────────────────────────────────────────────────
-- El score vigente se recalcula cada vez que cambia la calificación. El
-- congelado se guarda al asignar el closer y NO se toca nunca más: es lo único
-- que permite comparar closers con justicia cuando reciben leads distintos.
create table if not exists lead_quality (
  id           bigint generated always as identity primary key,
  lead_id      bigint not null references leads(id) on delete cascade,
  score        integer not null check (score between 0 and 100),
  nivel        text not null check (nivel in ('alto', 'medio', 'bajo')),
  aportes      jsonb not null default '[]',
  congelado    boolean not null default false,
  config_version text not null default 'v1',
  creado_en    timestamptz not null default now()
);
create index if not exists idx_lead_quality on lead_quality(lead_id, creado_en desc);

-- ── Notas con autor y fecha ────────────────────────────────────────────────
create table if not exists notas (
  id         bigint generated always as identity primary key,
  lead_id    bigint not null references leads(id) on delete cascade,
  texto      text not null,
  usuario_id bigint references usuarios(id) on delete set null,
  creado_en  timestamptz not null default now()
);
create index if not exists idx_notas_lead on notas(lead_id, creado_en desc);

alter table lead_calificacion enable row level security;
alter table lead_quality      enable row level security;
alter table notas             enable row level security;
