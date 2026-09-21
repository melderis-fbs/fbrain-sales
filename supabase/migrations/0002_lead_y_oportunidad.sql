-- FOUNDERS SALES OS · el lead y la oportunidad
--
-- Todo gira alrededor del lead. Un lead es la persona; una oportunidad es cada
-- vez que esa persona se sienta con un closer. La misma persona puede tener
-- varias oportunidades y no deja de ser la misma persona.
--
-- Nada se borra: `borrado_en`. Corregir información nunca exige borrar y
-- recrear (Parte 16).

create table if not exists leads (
  id            bigint generated always as identity primary key,
  nombre        text not null,
  -- Sólo espacios normalizados. «Maria» y «María» siguen siendo distintos:
  -- el sistema no decide por parecido, avisa.
  nombre_clave  text not null,
  -- Plegado sin acentos ni mayúsculas. Se usa para AVISAR de posibles
  -- duplicados, nunca para unir dos leads solo.
  nombre_pleg   text not null,
  email         text,
  email_pleg    text,
  telefono      text,
  telefono_pleg text,                    -- sólo dígitos, para comparar
  pais          text,
  empresa       text,
  fuente_id     bigint references fuentes(id) on delete set null,
  funnel_id     bigint references funnels(id) on delete set null,
  setter_id     bigint references setters(id) on delete set null,
  notas         text,
  links         text,
  info_negocio  text,
  info_extra    text,
  creado_por    bigint references usuarios(id) on delete set null,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  borrado_en    timestamptz
);
create index if not exists idx_leads_pleg     on leads(nombre_pleg) where borrado_en is null;
create index if not exists idx_leads_email    on leads(email_pleg) where borrado_en is null;
-- Por la cola del teléfono: «+54 11 5555-1234» y «11 5555 1234» son la misma
-- persona, y comparar los dígitos completos no los encuentra.
create index if not exists idx_leads_telefono on leads(right(telefono_pleg, 8)) where borrado_en is null;
create index if not exists idx_leads_setter   on leads(setter_id);
create index if not exists idx_leads_creado   on leads(creado_en desc);

-- ── La oportunidad ─────────────────────────────────────────────────────────
--
-- `estado` dice qué pasó con la reunión. `resultado` dice qué pasó con la
-- venta. Son dos cosas distintas y mezclarlas es lo que hace que después no se
-- pueda contestar «cuántas asistencias hubo» sin discutir.
--
-- La SEÑA no cierra la oportunidad: queda abierta hasta que se convierte o se
-- pierde (Parte 6).
create table if not exists oportunidades (
  id                bigint generated always as identity primary key,
  lead_id           bigint not null references leads(id) on delete cascade,
  closer_id         bigint references closers(id) on delete set null,
  closer_inicial_id bigint references closers(id) on delete set null,
  numero            integer not null default 1,        -- 1ª sesión, 2ª sesión…
  tipo_sesion       text not null default 'primera'
                      check (tipo_sesion in ('primera', 'segunda', 'seguimiento', 'onboarding', 'otra')),
  fecha_agenda      date,
  hora_agenda       time,
  estado            text not null default 'agendada'
                      check (estado in ('agendada', 'asistida', 'no_show', 'cancelada', 'reagendada')),
  resultado         text not null default 'pendiente'
                      check (resultado in ('pendiente', 'venta', 'sena', 'seguimiento', 'perdida', 'no_calificado')),
  hubo_oferta       boolean not null default false,
  motivo_perdida    text,
  valor_potencial   numeric(14,2),
  moneda            text not null default 'USD',
  proximo_contacto  date,
  proximo_paso      text,
  observaciones     text,
  creado_por        bigint references usuarios(id) on delete set null,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  borrado_en        timestamptz
);
create index if not exists idx_oport_lead     on oportunidades(lead_id);
create index if not exists idx_oport_closer   on oportunidades(closer_id) where borrado_en is null;
create index if not exists idx_oport_agenda   on oportunidades(fecha_agenda) where borrado_en is null;
create index if not exists idx_oport_proximo  on oportunidades(proximo_contacto)
  where borrado_en is null and proximo_contacto is not null;

-- ── Quién tocó cada oportunidad ────────────────────────────────────────────
-- El cierre no se atribuye 100% al que firmó (Parte 12.9). Acá se guarda quién
-- participó y en qué rol; cómo se reparte es una decisión de negocio que
-- todavía no está tomada, así que por ahora se registra sin repartir.
create table if not exists oportunidad_participaciones (
  id             bigint generated always as identity primary key,
  oportunidad_id bigint not null references oportunidades(id) on delete cascade,
  closer_id      bigint not null references closers(id) on delete cascade,
  rol            text not null check (rol in ('inicial', 'final', 'apoyo')),
  llamadas       integer not null default 0,
  creado_en      timestamptz not null default now(),
  unique (oportunidad_id, closer_id, rol)
);

-- ── Las llamadas ───────────────────────────────────────────────────────────
-- Una oportunidad puede tener más de una llamada. La transcripción vive aparte
-- para que ninguna lista la arrastre al navegador.
create table if not exists llamadas (
  id             bigint generated always as identity primary key,
  oportunidad_id bigint not null references oportunidades(id) on delete cascade,
  closer_id      bigint references closers(id) on delete set null,
  numero         integer not null default 1,
  fecha          date,
  duracion_seg   integer,
  asistio        boolean not null default true,
  creado_en      timestamptz not null default now()
);
-- Este índice sólo tiene sentido mientras `llamadas` cuelgue de una
-- oportunidad. Desde 0004 cuelga del lead, así que si esta migración se vuelve
-- a correr después —y correrlas de nuevo tiene que ser inofensivo— la columna
-- ya no está y crear el índice reventaría.
do $indice$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'llamadas' and column_name = 'oportunidad_id'
  ) then
    create index if not exists idx_llamadas_oport on llamadas(oportunidad_id, numero);
  end if;
end
$indice$;

create table if not exists transcripciones (
  id          bigint generated always as identity primary key,
  llamada_id  bigint not null references llamadas(id) on delete cascade,
  texto       text not null,
  caracteres  integer not null default 0,
  origen      text not null check (origen in ('pegado', 'archivo', 'automatico')),
  subida_por  bigint references usuarios(id) on delete set null,
  creado_en   timestamptz not null default now()
);
create index if not exists idx_transcripciones_llamada on transcripciones(llamada_id);

alter table leads                      enable row level security;
alter table oportunidades              enable row level security;
alter table oportunidad_participaciones enable row level security;
alter table llamadas                   enable row level security;
alter table transcripciones            enable row level security;
