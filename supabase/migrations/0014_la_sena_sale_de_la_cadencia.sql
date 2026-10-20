-- ── La seña saca de la cadencia ────────────────────────────────────────────
--
-- La lista de resultados que sacan un lead del pipeline de 12 toques tenía
-- venta, perdida y no calificado, pero no la seña. Un lead que quedó en la
-- cadencia y después señó seguía siendo perseguido como si no hubiera pasado
-- nada: la ficha decía «Seña» y el pipeline decía «tocale el toque 7». Dos
-- pantallas diciendo dos cosas distintas del mismo lead, y la que se lee
-- primero es la que manda.
--
-- El código ya no los mete más. Esto saca a los que YA quedaron adentro, que
-- de otro modo habría que arreglar uno por uno volviendo a guardar cada ficha.
--
-- Se corre sola de nuevo sin hacer nada: el filtro es `situacion <> 'fuera'`.
update seguimiento_estado se
   set situacion     = 'fuera',
       salio_en      = coalesce(se.salio_en, current_date),
       actualizado_en = now()
  from leads l
 where l.id = se.lead_id
   and l.borrado_en is null
   and se.situacion <> 'fuera'
   and l.resultado in ('sena', 'venta', 'perdida', 'no_calificado');
