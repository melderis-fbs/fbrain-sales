-- ── La cadencia termina ────────────────────────────────────────────────────
--
-- `toqueSiguiente` devuelve null después del último toque, y su comentario
-- dice por qué: «el lead salió de la cadencia y hay que decidir qué hacer con
-- él a mano, no dejarlo girando para siempre». Pero quien lo usaba hacía
-- `siguiente ?? actual`, así que el lead se quedaba clavado en el toque 12,
-- con la cuenta reiniciada desde hoy. Diez días después volvía a estar
-- vencido, y así para siempre: vencidos que nadie puede bajar porque no hay
-- toque que registrar.
--
-- Dos cosas acá. Una columna para decir POR QUÉ salió cada lead —hasta ahora
-- «fuera del pipeline» era una bolsa con el que no quiso, el que agendó y el
-- que se cerró, todos iguales— y la limpieza de los que quedaron girando.

alter table seguimiento_estado add column if not exists motivo_salida text;

-- Los que ya estaban afuera: el motivo sale de su último toque registrado.
update seguimiento_estado se
   set motivo_salida = i.estado
  from (select distinct on (lead_id) lead_id, estado
          from seguimiento_interacciones order by lead_id, creado_en desc, id desc) i
 where i.lead_id = se.lead_id
   and se.situacion = 'fuera'
   and se.motivo_salida is null
   and i.estado in ('no_interesado', 'agendo');

-- Y los que se quedaron girando en el último toque: ya se les registró ese
-- toque, así que no hay nada más que hacerles dentro de la cadencia.
update seguimiento_estado se
   set situacion = 'fuera',
       salio_en = coalesce(se.salio_en, current_date),
       motivo_salida = 'cadencia_agotada',
       actualizado_en = now()
 where se.situacion = 'activo'
   and se.toque_actual = (select max(orden) from seguimiento_toques where activo)
   and exists (select 1 from seguimiento_interacciones i
                where i.lead_id = se.lead_id and i.toque = se.toque_actual);
