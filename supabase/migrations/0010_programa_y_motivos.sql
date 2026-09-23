-- ── El programa y por qué se pierde ────────────────────────────────────────
--
-- PROGRAMA era texto libre. Dos personas escriben «Growth», «GROWTH» y
-- «growth» y después no se puede contar cuánto vendió cada programa: la
-- pregunta más barata de contestar se vuelve una discusión. Son dos, y son
-- éstos.
alter table ventas add column if not exists programa_norm text;

update ventas
   set programa_norm = case
         when lower(coalesce(programa, '')) like '%elite%'  then 'ELITE'
         when lower(coalesce(programa, '')) like '%growth%' then 'GROWTH'
         else null end
 where programa_norm is null;

update ventas set programa = programa_norm where programa_norm is not null;
alter table ventas drop column if exists programa_norm;

do $programa$
begin
  if not exists (select 1 from information_schema.constraint_column_usage
                  where table_name = 'ventas' and constraint_name = 'ventas_programa_check') then
    alter table ventas add constraint ventas_programa_check
      check (programa is null or programa in ('GROWTH', 'ELITE'));
  end if;
end
$programa$;

-- MOTIVO DE PÉRDIDA: entra «no interesado», que faltaba y es de los que más
-- se usan. El resto queda: borrar un motivo del check borraría el motivo de
-- los leads que ya lo tienen.
do $motivos$
begin
  alter table leads drop constraint if exists leads_motivo_perdida_check;
  alter table leads add constraint leads_motivo_perdida_check
    check (motivo_perdida is null or motivo_perdida in (
      'precio', 'timing', 'socio', 'confianza', 'urgencia', 'encaje',
      'competencia', 'no_entendio', 'no_tenia_dinero', 'no_era_decisor',
      'seguimiento_deficiente', 'no_interesado'));
end
$motivos$;

-- Las CUOTAS de una venta: cuántas se pactaron. Los pagos ya guardan cuál es
-- cada uno; faltaba el total, que es lo que deja decir «va 1 de 3».
alter table ventas add column if not exists cuotas integer;
