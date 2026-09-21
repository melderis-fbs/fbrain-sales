-- FOUNDERS SALES OS · casos de éxito y comisiones
--
-- Las dos cosas que faltaban para que la navegación no tuviera puertas que no
-- abren a ningún lado.

-- ── Casos de éxito ─────────────────────────────────────────────────────────
-- No es una galería de marketing: es munición para el seguimiento. El toque 3
-- de la cadencia dice «caso de éxito similar», y hasta ahora el closer tenía
-- que acordarse de uno. Por eso se guardan con industria y con el número, que
-- es lo que hace que un caso sirva para un prospecto concreto.
create table if not exists casos_exito (
  id           bigint generated always as identity primary key,
  titulo       text not null,
  cliente      text,
  industria    text,
  -- El antes y el después, en números. Es lo único que convence.
  situacion    text,
  resultado    text,
  metrica      text,
  cita         text,
  link         text,
  -- Para poder mandarlo por WhatsApp sin reescribirlo cada vez.
  mensaje      text,
  activo       boolean not null default true,
  creado_por   bigint references usuarios(id) on delete set null,
  creado_en    timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_casos_industria on casos_exito(industria) where activo;

-- ── Las reglas de comisión ─────────────────────────────────────────────────
-- Viven en `config`, no en el código: un porcentaje de comisión escrito en un
-- archivo .ts es algo que nadie del equipo comercial puede corregir un viernes
-- a la tarde, que es exactamente cuando hace falta.
--
-- `sobre` dice contra qué se calcula. Y no es un detalle: comisionar sobre lo
-- FACTURADO paga por plata que todavía no entró, y en un plan de cuotas eso es
-- pagar por adelantado. Por defecto va sobre lo COBRADO.
insert into config (clave, valor, descripcion) values
  ('comisiones',
   '{"sobre": "cash", "closer": 10, "setter": 3, "repesca": 2, "head": 0}',
   'Porcentajes de comisión. «sobre» puede ser cash (lo cobrado) o facturacion (lo vendido). La repesca la cobra quien reflotó el lead.')
on conflict (clave) do nothing;

alter table casos_exito enable row level security;
