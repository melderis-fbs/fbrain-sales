-- FOUNDERS SALES OS · el lead es la oportunidad
--
-- El modelo tenía una capa de más. María no es «un lead con dos oportunidades»:
-- María ES la oportunidad, y las llamadas que hagan falta para cerrarla —una,
-- dos o tres— cuelgan de ella.
--
-- Esta migración MUEVE las filas, no las tira. Al final desaparece la tabla
-- `oportunidades`, pero antes todo lo que tenía adentro queda en el lead: el
-- closer, la fecha, el estado, el resultado, la plata y las llamadas.
--
-- Es idempotente: si ya se corrió, los bloques que miran `oportunidades` se
-- saltean solos porque la tabla ya no está.
--
-- LO ÚNICO que se pierde: si un lead tenía DOS oportunidades cargadas, el lead
-- se queda con los datos de la más reciente. Es inherente al cambio de modelo
-- —ahora hay un solo resultado por lead— y las llamadas de las dos sobreviven,
-- que es donde está la historia.

-- ── El lead se queda con todo lo comercial ─────────────────────────────────
alter table leads add column if not exists closer_id         bigint references closers(id) on delete set null;
alter table leads add column if not exists closer_inicial_id bigint references closers(id) on delete set null;
alter table leads add column if not exists industria         text;
alter table leads add column if not exists fecha_sesion      date;
alter table leads add column if not exists hora_sesion       time;
alter table leads add column if not exists tipo_sesion       text not null default 'primera'
  check (tipo_sesion in ('primera', 'segunda', 'seguimiento', 'onboarding', 'otra'));
alter table leads add column if not exists estado            text not null default 'agendado'
  check (estado in ('agendado', 'asistio', 'no_show', 'cancelado', 'reagendado'));
alter table leads add column if not exists resultado         text not null default 'pendiente'
  check (resultado in ('pendiente', 'venta', 'sena', 'seguimiento', 'perdida', 'no_calificado'));
alter table leads add column if not exists hubo_oferta       boolean not null default false;
alter table leads add column if not exists motivo_perdida    text;
alter table leads add column if not exists valor_potencial   numeric(14,2);
alter table leads add column if not exists moneda            text not null default 'USD';
alter table leads add column if not exists proximo_contacto  date;
alter table leads add column if not exists proximo_paso      text;
alter table leads add column if not exists observaciones     text;

-- ── Ciclos y repesca ───────────────────────────────────────────────────────
-- Un lead que se pierde y vuelve es EL MISMO lead, no uno nuevo: si no, se
-- parte la historia. Pero el ciclo hay que contarlo, porque quien lo reflota
-- cobra por eso — y suele no ser el mismo que después cierra.
alter table leads add column if not exists ciclo          integer not null default 1;
alter table leads add column if not exists reflotado_por  bigint references usuarios(id) on delete set null;
alter table leads add column if not exists reflotado_en   timestamptz;

-- ── Mudar lo que había en oportunidades ────────────────────────────────────
do $mudanza$
declare
  -- Las columnas viejas y la tabla vieja pueden faltar por separado: si esta
  -- migración ya se corrió y alguien vuelve a pasar 0002, la tabla
  -- `oportunidades` reaparece vacía pero `ventas.oportunidad_id` ya no está.
  -- Por eso cada paso se pregunta por lo suyo, y no por la tabla a secas.
  cuelga_de_la_oportunidad boolean;
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'oportunidades'
  ) then
    return;   -- ya se mudó todo: no hay nada que hacer
  end if;

  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'ventas' and column_name = 'oportunidad_id'
  ) into cuelga_de_la_oportunidad;

  -- Cada lead se queda con su oportunidad MÁS RECIENTE. Los nombres de los
  -- estados cambian de femenino a masculino porque ahora describen al lead,
  -- así que hay que traducirlos: 'asistida' era la oportunidad, 'asistio' es
  -- la persona.
  update leads l set
    closer_id         = o.closer_id,
    closer_inicial_id = coalesce(o.closer_inicial_id, o.closer_id),
    fecha_sesion      = o.fecha_agenda,
    hora_sesion       = o.hora_agenda,
    tipo_sesion       = o.tipo_sesion,
    estado            = case o.estado
                          when 'agendada'   then 'agendado'
                          when 'asistida'   then 'asistio'
                          when 'no_show'    then 'no_show'
                          when 'cancelada'  then 'cancelado'
                          when 'reagendada' then 'reagendado'
                          else 'agendado'
                        end,
    resultado         = o.resultado,
    hubo_oferta       = o.hubo_oferta,
    motivo_perdida    = o.motivo_perdida,
    valor_potencial   = o.valor_potencial,
    moneda            = o.moneda,
    proximo_contacto  = o.proximo_contacto,
    proximo_paso      = o.proximo_paso,
    observaciones     = o.observaciones
  from (
    select distinct on (lead_id) *
      from oportunidades
     where borrado_en is null
     order by lead_id, coalesce(fecha_agenda, creado_en::date) desc, id desc
  ) o
  where o.lead_id = l.id;

  -- La plata y las llamadas pasan a colgar del lead.
  alter table ventas   add column if not exists lead_id bigint references leads(id) on delete cascade;
  alter table senias   add column if not exists lead_id bigint references leads(id) on delete cascade;
  alter table llamadas add column if not exists lead_id bigint references leads(id) on delete cascade;

  if cuelga_de_la_oportunidad then
    update ventas   v set lead_id = o.lead_id from oportunidades o
     where o.id = v.oportunidad_id and v.lead_id is null;
    update senias   s set lead_id = o.lead_id from oportunidades o
     where o.id = s.oportunidad_id and s.lead_id is null;
    update llamadas c set lead_id = o.lead_id from oportunidades o
     where o.id = c.oportunidad_id and c.lead_id is null;

    -- El audit log apuntaba al id de la oportunidad. Se reapunta al lead, si no
    -- la historia de un lead reasignado queda sin el renglón que lo explica.
    update cambios c set entidad = 'lead', entidad_id = o.lead_id
      from oportunidades o
     where c.entidad in ('oportunidad', 'venta', 'sena') and c.entidad_id = o.id;

    -- Las columnas viejas se van ANTES que la tabla: mientras exista una que
    -- apunte a `oportunidades`, Postgres no la deja borrar —y hace bien—.
    alter table ventas   drop column oportunidad_id;
    alter table senias   drop column oportunidad_id;
    alter table llamadas drop column oportunidad_id;
  end if;

  drop table if exists oportunidad_participaciones;
  drop table if exists oportunidades;
end
$mudanza$;

-- Si la tabla ya no estaba —porque esta migración ya se corrió— estas columnas
-- igual tienen que existir.
alter table ventas   add column if not exists lead_id bigint references leads(id) on delete cascade;
alter table senias   add column if not exists lead_id bigint references leads(id) on delete cascade;
alter table llamadas add column if not exists lead_id bigint references leads(id) on delete cascade;

-- Si algo quedó sin lead —no debería, el borrado en cascada lo impide— esto
-- rompe acá y no más adelante con una pantalla a medias.
alter table ventas   alter column lead_id set not null;
alter table senias   alter column lead_id set not null;
alter table llamadas alter column lead_id set not null;

-- Las llamadas se numeraban dentro de la oportunidad. Ahora el número es
-- dentro del lead: «llamada 2 de María», no «llamada 1 de su segunda
-- oportunidad».
with renumeradas as (
  select id, row_number() over (partition by lead_id order by fecha nulls last, id) as n
    from llamadas
)
update llamadas c set numero = r.n from renumeradas r
 where r.id = c.id and c.numero is distinct from r.n;

create index if not exists idx_ventas_lead   on ventas(lead_id);
create index if not exists idx_senias_lead   on senias(lead_id);
create index if not exists idx_llamadas_lead on llamadas(lead_id, numero);

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
-- en otro momento: el alta puede venir de una integración sin nada de esto.
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
  id             bigint generated always as identity primary key,
  lead_id        bigint not null references leads(id) on delete cascade,
  score          integer not null check (score between 0 and 100),
  nivel          text not null check (nivel in ('alto', 'medio', 'bajo')),
  aportes        jsonb not null default '[]',
  congelado      boolean not null default false,
  config_version text not null default 'v1',
  creado_en      timestamptz not null default now()
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

-- Lo que el lead tenía escrito a mano en `notas` pasa a ser la primera nota de
-- verdad, con su fecha. Si no, se pierde texto que alguien escribió.
do $notas$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'leads' and column_name = 'notas'
  ) then
    insert into notas (lead_id, texto, usuario_id, creado_en)
    select l.id, l.notas, l.creado_por, l.creado_en
      from leads l
     where l.notas is not null and btrim(l.notas) <> ''
       and not exists (select 1 from notas n where n.lead_id = l.id);
    alter table leads drop column notas;
  end if;
end
$notas$;

alter table lead_calificacion enable row level security;
alter table lead_quality      enable row level security;
alter table notas             enable row level security;
