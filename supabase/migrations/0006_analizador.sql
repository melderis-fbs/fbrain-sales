-- FOUNDERS SALES OS · el analizador de llamadas
--
-- La diferencia con el analizador anterior está acá adentro: el modelo NO
-- guarda una nota. Guarda, por dimensión, un NIVEL de rúbrica con su CITA
-- TEXTUAL, y los eventos que detectó, también con cita. La nota la calcula el
-- motor con los pesos, los topes y las penalizaciones de `scoring_config`.
--
-- Por eso recalibrar no cuesta una llamada al modelo: se cambia un peso y se
-- recalculan mil análisis en segundos sobre los niveles ya guardados.

-- El playbook de cada closer, versionado. Un análisis sabe con qué versión se
-- evaluó, así una nota vieja sigue siendo legible cuando el guion cambió.
create table if not exists playbooks (
  id         bigint generated always as identity primary key,
  closer_id  bigint not null references closers(id) on delete cascade,
  nombre     text not null,
  oferta     text,
  script     text not null,
  version    integer not null default 1,
  vigente    boolean not null default true,
  creado_en  timestamptz not null default now()
);
create index if not exists idx_playbooks_closer on playbooks(closer_id, vigente);

-- El modelo de scoring, versionado. Nunca se edita una versión publicada: se
-- crea la siguiente y se comparan las distribuciones antes de adoptarla.
create table if not exists scoring_config (
  id               bigint generated always as identity primary key,
  version          text not null unique,
  dimensiones      jsonb not null,   -- [{clave, nombre, peso}]
  niveles          jsonb not null,   -- {0:1.0, 1:3.0, 2:5.0, 3:7.0, 4:9.0}
  penalizaciones   jsonb not null,   -- {evento: -0.8}
  bonificaciones   jsonb not null,
  topes            jsonb not null,   -- [{dimension, menorA, tope}]
  vigente          boolean not null default false,
  creado_en        timestamptz not null default now(),
  creado_por       bigint references usuarios(id) on delete set null
);

create table if not exists analisis (
  id                bigint generated always as identity primary key,
  llamada_id        bigint not null references llamadas(id) on delete cascade,
  transcripcion_id  bigint not null references transcripciones(id) on delete cascade,
  playbook_id       bigint references playbooks(id) on delete set null,
  estado            text not null default 'subida'
                      check (estado in ('subida', 'leyendo', 'evaluando', 'analizada', 'error')),
  error             text,
  -- Lo que se cuenta en código, no se le pregunta al modelo.
  turnos_closer     integer,
  turnos_prospecto  integer,
  palabras_closer   integer,
  palabras_prospecto integer,
  modelo            text,
  creado_en         timestamptz not null default now(),
  creado_por        bigint references usuarios(id) on delete set null
);
create index if not exists idx_analisis_llamada on analisis(llamada_id, creado_en desc);

-- Lo que devuelve el modelo: un nivel y una cita. Sin cita, el nivel no entra.
create table if not exists analisis_niveles (
  id            bigint generated always as identity primary key,
  analisis_id   bigint not null references analisis(id) on delete cascade,
  dimension     text not null,
  nivel         integer check (nivel between 0 and 4),
  cita          text,
  justificacion text,
  sin_evidencia boolean not null default false,
  unique (analisis_id, dimension)
);

create table if not exists analisis_eventos (
  id          bigint generated always as identity primary key,
  analisis_id bigint not null references analisis(id) on delete cascade,
  evento      text not null,
  cita        text,
  momento     text
);
create index if not exists idx_eventos_analisis on analisis_eventos(analisis_id);

create table if not exists analisis_objeciones (
  id                bigint generated always as identity primary key,
  analisis_id       bigint not null references analisis(id) on delete cascade,
  tipo              text,
  textual           text,
  objecion_real     text,
  respuesta         text,
  mejor_respuesta   text
);

create table if not exists analisis_feedback (
  analisis_id       bigint primary key references analisis(id) on delete cascade,
  lo_mejor          jsonb not null default '[]',
  lo_que_costo      jsonb not null default '[]',
  error_principal   text,
  que_hubiera_hecho text,
  momento_clave     text,
  frase_alternativa text,
  una_sola_cosa     text
);

-- La nota. Una fila por versión del modelo de scoring: cuando se recalibra se
-- agrega otra, nunca se pisa la anterior.
create table if not exists call_scores (
  id                 bigint generated always as identity primary key,
  analisis_id        bigint not null references analisis(id) on delete cascade,
  scoring_config_id  bigint not null references scoring_config(id) on delete cascade,
  score              numeric(3,1) not null,
  base               numeric(3,1) not null,
  penalizacion       numeric(3,1) not null default 0,
  bonificacion       numeric(3,1) not null default 0,
  tope_aplicado      numeric(3,1),
  vigente            boolean not null default true,
  creado_en          timestamptz not null default now(),
  unique (analisis_id, scoring_config_id)
);
create index if not exists idx_call_scores on call_scores(analisis_id) where vigente;

create table if not exists score_dimensiones (
  id            bigint generated always as identity primary key,
  call_score_id bigint not null references call_scores(id) on delete cascade,
  dimension     text not null,
  score         numeric(3,1) not null,
  peso          integer not null,
  aporte        numeric(4,2) not null
);
create index if not exists idx_score_dim on score_dimensiones(call_score_id);

alter table playbooks           enable row level security;
alter table scoring_config      enable row level security;
alter table analisis            enable row level security;
alter table analisis_niveles    enable row level security;
alter table analisis_eventos    enable row level security;
alter table analisis_objeciones enable row level security;
alter table analisis_feedback   enable row level security;
alter table call_scores         enable row level security;
alter table score_dimensiones   enable row level security;
