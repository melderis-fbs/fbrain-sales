-- FOUNDERS SALES OS · la plata y los objetivos
--
-- Tres números que NO son el mismo y por eso son tres tablas:
--
--   ventas   lo que se vendió    → Facturación
--   pagos    lo que se cobró     → Cash Collected
--   senias   lo que se comprometió sin cerrar
--
-- Decisión tomada: la SEÑA no entra a Cash Collected ni al forecast. Se ve en
-- su propia tarjeta y en el embudo, y recién impacta cuando se convierte en
-- venta. Al convertirla, su importe se registra como el primer pago de la venta
-- (`pagos.origen = 'sena'`), así el cobro no se cuenta dos veces ni se pierde.

create table if not exists ventas (
  id             bigint generated always as identity primary key,
  oportunidad_id bigint not null references oportunidades(id) on delete cascade,
  importe        numeric(14,2) not null,
  moneda         text not null default 'USD',
  fecha          date not null,
  programa       text,
  creado_por     bigint references usuarios(id) on delete set null,
  creado_en      timestamptz not null default now(),
  borrado_en     timestamptz
);
create index if not exists idx_ventas_fecha on ventas(fecha) where borrado_en is null;
create index if not exists idx_ventas_oport on ventas(oportunidad_id);

create table if not exists senias (
  id                  bigint generated always as identity primary key,
  oportunidad_id      bigint not null references oportunidades(id) on delete cascade,
  importe             numeric(14,2) not null,
  moneda              text not null default 'USD',
  fecha               date not null,
  saldo_pendiente     numeric(14,2),
  fecha_comprometida  date,
  estado              text not null default 'abierta'
                        check (estado in ('abierta', 'convertida', 'perdida', 'vencida')),
  venta_id            bigint references ventas(id) on delete set null,
  creado_por          bigint references usuarios(id) on delete set null,
  creado_en           timestamptz not null default now(),
  borrado_en          timestamptz
);
create index if not exists idx_senias_oport  on senias(oportunidad_id);
create index if not exists idx_senias_fecha  on senias(fecha) where borrado_en is null;
create index if not exists idx_senias_vence  on senias(fecha_comprometida)
  where borrado_en is null and estado = 'abierta';

create table if not exists pagos (
  id         bigint generated always as identity primary key,
  venta_id   bigint not null references ventas(id) on delete cascade,
  importe    numeric(14,2) not null,
  moneda     text not null default 'USD',
  fecha      date not null,
  medio      text,
  origen     text not null default 'cuota' check (origen in ('cuota', 'sena', 'contado')),
  n_cuota    integer,
  cuotas_totales integer,
  estado     text not null default 'cobrado' check (estado in ('cobrado', 'pendiente', 'vencido')),
  creado_en  timestamptz not null default now(),
  borrado_en timestamptz
);
create index if not exists idx_pagos_fecha on pagos(fecha) where borrado_en is null;
create index if not exists idx_pagos_venta on pagos(venta_id);

-- ── Objetivos configurables (Parte 11.2: no hardcodeados) ──────────────────
create table if not exists objetivos (
  id         bigint generated always as identity primary key,
  ambito     text not null check (ambito in ('empresa', 'closer', 'setter')),
  ambito_id  bigint,                                   -- null cuando es empresa
  periodo    text not null check (periodo in ('semana', 'mes')),
  desde      date not null,
  hasta      date not null,
  tipo       text not null check (tipo in ('facturacion', 'cash', 'ventas', 'agendas')),
  valor      numeric(14,2) not null,
  moneda     text not null default 'USD',
  creado_por bigint references usuarios(id) on delete set null,
  creado_en  timestamptz not null default now(),
  unique (ambito, ambito_id, periodo, desde, tipo)
);
create index if not exists idx_objetivos_rango on objetivos(tipo, desde, hasta);

alter table ventas    enable row level security;
alter table senias    enable row level security;
alter table pagos     enable row level security;
alter table objetivos enable row level security;
