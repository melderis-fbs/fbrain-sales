-- ── Cada reunión, su fila ──────────────────────────────────────────────────
--
-- El lead guarda UNA fecha de reunión. Mientras cada lead tuviera una sola,
-- alcanzaba; con una segunda llamada no: re-agendar el lead le pisa la fecha a
-- la primera, y el mes en que ocurrió esa primera pierde su agenda para
-- siempre. Un número que cambia hacia atrás es peor que uno que falta.
--
-- `llamadas` ya tenía la forma —fecha, tipo, asistió, resultado— y estaba
-- vacía: nadie la escribía. Desde ahora la escribe la carga del resultado, y
-- esto rellena lo que ya había pasado para que ningún mes quede en cero.

insert into llamadas (lead_id, closer_id, numero, fecha, asistio, tipo_sesion, resultado, ciclo)
select l.id, l.closer_id, 1, l.fecha_sesion,
       l.estado = 'asistio',
       l.tipo_sesion,
       case when l.resultado = 'pendiente' then null else l.resultado end,
       l.ciclo
  from leads l
 where l.fecha_sesion is not null
   and l.borrado_en is null
   and not exists (select 1 from llamadas x where x.lead_id = l.id);

-- La reunión que el lead tiene hoy es la ÚLTIMA de su historia. Sin esto, un
-- lead que ya venía con llamadas cargadas a mano podría quedar sin la fila de
-- su reunión actual.
insert into llamadas (lead_id, closer_id, numero, fecha, asistio, tipo_sesion, resultado, ciclo)
select l.id, l.closer_id,
       (select coalesce(max(x.numero), 0) + 1 from llamadas x where x.lead_id = l.id),
       l.fecha_sesion,
       l.estado = 'asistio',
       l.tipo_sesion,
       case when l.resultado = 'pendiente' then null else l.resultado end,
       l.ciclo
  from leads l
 where l.fecha_sesion is not null
   and l.borrado_en is null
   and not exists (select 1 from llamadas x
                    where x.lead_id = l.id and x.fecha = l.fecha_sesion);

create index if not exists idx_llamadas_fecha on llamadas(fecha) where fecha is not null;
