-- ═══════════════════════════════════════════════════════════════════════════
-- ¿Cuánta de la facturación es plata que se contó dos veces?
--
-- Para correr en Supabase → SQL Editor, en este orden. Las tres primeras SÓLO
-- LEEN: no tocan nada. La limpieza la hace la migración 0011, que ya está en
-- el repositorio.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1 · Los leads con más de una venta activa. Si hay filas acá, la facturación
--     del mes está inflada exactamente en esa diferencia.
select l.id, l.nombre, l.ciclo,
       count(*)            as ventas_cargadas,
       sum(v.importe)      as suma_que_esta_contando,
       max(v.importe)      as la_mas_grande,
       (array_agg(v.importe order by v.fecha desc, v.id desc))[1] as la_ultima
  from ventas v
  join leads l on l.id = v.lead_id
 where v.borrado_en is null and l.borrado_en is null
 group by l.id, l.nombre, l.ciclo
having count(*) > 1
 order by sum(v.importe) desc;

-- 2 · Cuánta plata sobra en total. Es lo que la migración 0011 saca de la
--     facturación —y nada más que eso: los cobros se mudan a la venta que
--     queda, así que el cash collected no se mueve.
with quedan as (
  select distinct on (lead_id) id
    from ventas where borrado_en is null
   order by lead_id, fecha desc, id desc
)
select count(*)      as ventas_de_mas,
       sum(importe)  as plata_fantasma,
       moneda
  from ventas
 where borrado_en is null and id not in (select id from quedan)
 group by moneda;

-- 3 · La facturación como queda después. Cambiá las fechas por el mes que
--     estés mirando.
with quedan as (
  select distinct on (lead_id) id
    from ventas where borrado_en is null
   order by lead_id, fecha desc, id desc
)
select v.moneda,
       sum(v.importe) as facturacion_real,
       count(*)       as ventas
  from ventas v
  join leads l on l.id = v.lead_id and l.borrado_en is null
 where v.borrado_en is null
   and v.id in (select id from quedan)
   and v.fecha between '2026-09-01' and '2026-09-30'
 group by v.moneda;
