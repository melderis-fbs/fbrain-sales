-- ── La cadencia arranca el día de la llamada ───────────────────────────────
--
-- Arrancaba el día en que alguien cargaba el resultado, y se vio enseguida al
-- subir un histórico: treinta llamadas de todo un mes entraron con fecha de
-- hoy y el pipeline decía que a las treinta les tocaba el primer toque hoy.
-- Era mentira —la mitad ya tenía que ir por el toque 6— y un pipeline que
-- miente sobre qué hay que hacer hoy se deja de mirar el segundo día.
--
-- Esto corrige lo que ya está cargado, y sólo eso: los leads que están en el
-- primer toque y que NADIE tocó todavía. Uno con toques hechos ya recuenta
-- desde su último toque real, y pisarle la fecha sería inventarle un atraso
-- que no tiene.
update seguimiento_estado se
   set desde = l.fecha_sesion,
       ingreso_en = l.fecha_sesion,
       actualizado_en = now()
  from leads l
 where l.id = se.lead_id
   and l.borrado_en is null
   and l.fecha_sesion is not null
   and se.ingreso_en > l.fecha_sesion
   and se.toque_actual = 1
   and not exists (
     select 1 from seguimiento_interacciones i where i.lead_id = se.lead_id
   );
