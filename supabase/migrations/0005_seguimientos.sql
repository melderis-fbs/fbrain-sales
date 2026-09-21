-- FOUNDERS SALES OS · el pipeline de seguimientos
--
-- Doce toques con su día. El lead entra cuando el closer marca «seguimiento»,
-- y de ahí en adelante la fecha de cada toque se calcula desde el ÚLTIMO TOQUE
-- REAL, no desde el ingreso: si un toque se hizo con dos días de atraso, los
-- que vienen se corren esos dos días en vez de nacer todos vencidos.

-- La cadencia es configurable: estos nombres y días se van a querer ajustar en
-- tres meses, cuando se vea qué toque convierte.
create table if not exists seguimiento_toques (
  id      bigint generated always as identity primary key,
  orden   integer not null unique,
  nombre  text not null,
  dias    integer not null,
  activo  boolean not null default true
);

insert into seguimiento_toques (orden, nombre, dias) values
  (1,  'Email resumen post-llamada',        0),
  (2,  'Seguimiento WhatsApp',              1),
  (3,  'Caso de éxito similar',             3),
  (4,  'Llamada — romper objeción',         7),
  (5,  'Testimonio + garantía reforzada',  10),
  (6,  'Contenido de valor / Lead Magnet', 15),
  (7,  'Check-in suave',                   21),
  (8,  'Llamada — nuevo ángulo',           35),
  (9,  'Caso de estudio / win reciente',   45),
  (10, 'Oferta especial por tiempo limitado', 60),
  (11, 'Check-in suave',                   70),
  (12, 'Llamada final — decisión',         80)
on conflict (orden) do nothing;

-- Dónde está cada lead dentro de la cadencia.
--
-- `desde` es la fecha desde la que se cuenta el próximo toque: al entrar es el
-- ingreso, y después es la fecha del último toque hecho.
create table if not exists seguimiento_estado (
  lead_id        bigint primary key references leads(id) on delete cascade,
  toque_actual   integer not null default 1,
  desde          date not null,
  ingreso_en     date not null,
  -- 'activo' es la cadencia normal; 'largo' es un pedido del cliente para una
  -- fecha puntual; 'fuera' es no interesado y deja de ocupar lugar.
  situacion      text not null default 'activo' check (situacion in ('activo', 'largo', 'fuera')),
  fecha_larga    date,
  salio_en       date,
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_seg_situacion on seguimiento_estado(situacion, toque_actual);
create index if not exists idx_seg_larga on seguimiento_estado(fecha_larga)
  where situacion = 'largo';

-- Cada toque hecho, con lo que contestó el lead.
create table if not exists seguimiento_interacciones (
  id         bigint generated always as identity primary key,
  lead_id    bigint not null references leads(id) on delete cascade,
  toque      integer not null,
  estado     text not null check (estado in
               ('contesto', 'no_contesto', 'sigue_interesado', 'agendo', 'no_interesado')),
  nota       text,
  usuario_id bigint references usuarios(id) on delete set null,
  creado_en  timestamptz not null default now()
);
create index if not exists idx_seg_inter on seguimiento_interacciones(lead_id, creado_en desc);

alter table seguimiento_toques        enable row level security;
alter table seguimiento_estado        enable row level security;
alter table seguimiento_interacciones enable row level security;
