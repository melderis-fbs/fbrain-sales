-- ── Una venta por ciclo, y no cinco ────────────────────────────────────────
--
-- El error más caro que tuvo el sistema, y no se veía: cargar el resultado
-- INSERTABA una venta cada vez. El closer guardaba la ficha, se daba cuenta de
-- que el importe tenía un dígito de más, corregía y volvía a guardar: dos
-- ventas. La facturación del mes contaba la plata dos veces —tres, cuatro— y
-- no había forma de sacarla desde la aplicación.
--
-- Desde ahora guardar CORRIGE la venta del ciclo en curso. Esta migración
-- limpia lo que quedó y pone el candado para que no vuelva a pasar.
--
-- El CICLO importa: un lead perdido que se reflota y compra en el segundo
-- intento tiene dos ventas de verdad, y ésas no son duplicados. Por eso el
-- candado es por (lead, ciclo) y no por lead.

alter table ventas add column if not exists ciclo integer not null default 1;
alter table senias add column if not exists ciclo integer not null default 1;

-- Lo ya cargado se le atribuye al ciclo en el que está el lead hoy. Es lo más
-- cerca de la verdad que se puede estar sin inventar: la enorme mayoría de los
-- leads nunca se reflotó, y los que sí vendieron en el ciclo en que están.
update ventas v set ciclo = l.ciclo
  from leads l where l.id = v.lead_id and v.ciclo = 1 and l.ciclo > 1;
update senias s set ciclo = l.ciclo
  from leads l where l.id = s.lead_id and s.ciclo = 1 and l.ciclo > 1;

-- ── Los duplicados que ya están cargados ───────────────────────────────────
--
-- Se queda la ÚLTIMA de cada (lead, ciclo): es la que la ficha viene mostrando
-- y la que el closer dejó bien después de corregir.
--
-- Los COBROS de las que se van se mudan a la que queda. Un cobro es plata que
-- entró de verdad: borrarlo con su venta bajaría el cash collected de un mes
-- que ya se reportó, y ese número no puede moverse por una limpieza.
with quedan as (
  select distinct on (lead_id, ciclo) id, lead_id, ciclo
    from ventas where borrado_en is null
   order by lead_id, ciclo, fecha desc, id desc
)
update pagos p set venta_id = q.id
  from ventas v join quedan q on q.lead_id = v.lead_id and q.ciclo = v.ciclo
 where p.venta_id = v.id and v.borrado_en is null and v.id <> q.id;

with quedan as (
  select distinct on (lead_id, ciclo) id
    from ventas where borrado_en is null
   order by lead_id, ciclo, fecha desc, id desc
)
update ventas set borrado_en = now()
 where borrado_en is null and id not in (select id from quedan);

-- Las señas, igual. Una seña convertida ya es una venta y no se toca: lo que
-- sobra son las abiertas repetidas.
with quedan as (
  select distinct on (lead_id, ciclo) id
    from senias where borrado_en is null and estado = 'abierta'
   order by lead_id, ciclo, fecha desc, id desc
)
update senias set borrado_en = now()
 where borrado_en is null and estado = 'abierta' and id not in (select id from quedan);

-- ── El candado ─────────────────────────────────────────────────────────────
-- Que el arreglo no dependa de que el código siga estando bien escrito.
create unique index if not exists idx_ventas_una_por_ciclo
  on ventas(lead_id, ciclo) where borrado_en is null;
create unique index if not exists idx_senias_una_abierta_por_ciclo
  on senias(lead_id, ciclo) where borrado_en is null and estado = 'abierta';
