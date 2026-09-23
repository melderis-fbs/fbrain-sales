-- ── El informe por fases del script ────────────────────────────────────────
--
-- El análisis medía si la venta consultiva estuvo bien hecha —descubrimiento,
-- dolor, cierre— y eso es cierto para cualquier equipo. Faltaba la otra
-- pregunta, que es la que el equipo hace todos los días: ¿esta llamada siguió
-- NUESTRO guión? Con sus fases, sus pesos y su orden.
--
-- Las fases viven en el PLAYBOOK de cada closer, no en una lista fija: si el
-- script cambia, el análisis mide el script nuevo sin tocar código, y dos
-- closers con guiones distintos se miden cada uno contra el suyo. Una
-- adherencia calculada contra un guión que no es el que usa el closer es un
-- número que suena preciso y no significa nada.
alter table playbooks add column if not exists fases jsonb not null default '[]'::jsonb;

-- Lo que el modelo devuelve de cada fase. Una fila por fase y por análisis:
-- así se puede preguntar «en qué fase se cae este equipo» sin abrir un JSON.
create table if not exists analisis_fases (
  id            bigint generated always as identity primary key,
  analisis_id   bigint not null references analisis(id) on delete cascade,
  clave         text not null,
  nombre        text not null,
  peso          integer not null default 0,
  orden         integer not null default 0,
  -- La nota de la fase: qué tan bien se hizo. Puede faltar.
  nota          numeric(3,1),
  -- Y si se hizo, que es otra pregunta: un paso puede estar ejecutado y mal.
  ejecucion     text not null default 'no_ejecutado'
                check (ejecucion in ('ejecutado', 'parcial', 'no_ejecutado')),
  lo_que_hizo   text,
  cita          text,
  lo_que_debia  text,
  analisis      text,
  se_dejo_pasar text,
  creado_en     timestamptz not null default now(),
  unique (analisis_id, clave)
);
create index if not exists idx_analisis_fases on analisis_fases(analisis_id);

-- Los dos números de arriba del informe y el cierre narrativo.
alter table analisis add column if not exists adherencia_pct numeric(4,1);
alter table analisis add column if not exists nota_fases numeric(3,1);
alter table analisis add column if not exists valoracion_perfil text;
alter table analisis add column if not exists errores_criticos jsonb not null default '[]'::jsonb;
alter table analisis add column if not exists recomendaciones jsonb not null default '[]'::jsonb;
alter table analisis add column if not exists conclusion text;
