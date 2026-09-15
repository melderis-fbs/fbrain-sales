# FOUNDERS SALES OS — IMPLEMENTATION PLAN

Análisis del estado actual y plan de construcción. **Todavía no se escribió una
línea de código de la aplicación**: este documento es el paso previo que pide la
Parte 20 del prompt maestro.

Fecha del análisis: 15/09/2026.

---

## Parte 0 · Lo primero: no hay un proyecto actual, hay cuatro

El documento dice «existe un proyecto actual funcionando». Lo hay, pero no es
uno solo y no está donde apunta esta sesión.

**Los dos repositorios a los que esta sesión tiene permiso de escribir están
vacíos**: `melderis-fbs/fbrain-sales` y `melderis-fbs/founders-sales` no tienen
ni un commit. La operación comercial vive repartida en cuatro aplicaciones que
no se hablan entre sí:

| Repositorio | Qué es | Stack | Última vez |
|---|---|---|---|
| `claude/` (raíz) | **Dashboard comercial**. Agendas, closers, llamadas, anuncios, ingresos/egresos. | Next 14 + Google Sheets vía Apps Script | — |
| `claude/app-comercial/` | Cobranzas, facturas, comisiones, proyección | Next + Google Sheets | — |
| `synoma` | **Analizador de llamadas** + motor de contenido para clientes del programa | HTML plano + Supabase Edge Functions | 14/09 |
| `clientes` | **Biblioteca comercial**: clientes y lead magnets, con asistente IA | Next + Notion API | 30/06 |
| `founders-brain` | Post-venta: expediente del cliente, sesiones, diagnóstico | Next 15 + Postgres (`pg`) | 14/09 |
| `fbrain` | Versión anterior de lo mismo que `founders-brain` | Next + Supabase + pgvector | 09/09 |

Y falta una pieza central: **no existe la entidad LEAD en ninguna parte**. Ni
`leads`, ni `oportunidades`, ni nada que se le parezca. El dashboard comercial
lee filas mensuales de una planilla; el analizador guarda llamadas colgadas de
un `cliente_id` del programa; la biblioteca vive en Notion.

Esto explica el problema de la Parte 7.3 —«no se pueden editar los leads»— de
raíz: **no hay un registro que editar**. Una agenda es una fila en una hoja de
cálculo que llegó por un webhook de Zapier desde un mensaje de Slack. No tiene
id, no tiene historia, y la aplicación que la muestra es de sólo lectura.

> Esto es la primera pregunta del final: cuál de estos es «el proyecto actual»
> contra el que hay que no romper nada. Ver Parte 15.

---

## Parte 1 · Qué existe hoy, documentado

### 1.1 · Dashboard comercial (`claude/`)

**Qué hace.** Seis pestañas sobre datos mensuales: Overview, Agendas, Closers,
Llamadas y Seguimientos, Anuncios, Ingresos/Egresos.

**Rutas.** `app/page.js` (una sola página con pestañas), `app/api/sheets/route.js`,
`app/api/cron/refresh/route.js`.

**Componentes reutilizables.** `components/ui/StatCard.jsx`, `DataTable.jsx`,
`MonthSelector.jsx`, `TabNav.jsx`. Son sanos y sirven de base visual.

**Datos.** No hay base de datos. `lib/sheets.js` pega contra un Google Apps
Script (`google-apps-script/Code.gs`) que expone seis pestañas de una planilla:
`negocio`, `agendas`, `llamadas`, `closers`, `anuncios`, `ingresos`. La escritura
entra por otro lado: Slack → Zapier → webhook POST al mismo Apps Script.

**La forma de los datos de hoy** (de `lib/mockData.js`, que es el contrato real):

- `negocio` (una fila por mes): ventas nuevas/back, facturación, cash collected,
  %CC, costos, rentabilidad, objetivo en pesos y en ventas, faltantes.
- `agendas` (una fila por agenda): mes, fecha de registro, nombre, nicho, fecha
  de reunión, fuente (`Anuncios` | `Bio IG`).
- `llamadas` (una fila por llamada): mes, fecha, closer, nombre, resultado,
  próximo paso, fecha de próximo contacto, observaciones.
- `closers` (una fila por closer **por mes**, ya agregada): agendadas,
  asistencias, reagenda, segunda llamada, asistencia a segunda, ofertas, **seña**,
  cierres, %cierre, %asistencia.
- `anuncios` (por mes): inversión, agendas cualificadas, costo por agenda,
  llamadas en calendario, asistencias, costo por asistencia, cierres, ROAS.
- `ingresos`: `egresos` por rubro y mes, `cobranzas` (nombre, programa, n° de
  cuota, monto, fecha, medio, estado).

Dos cosas importantes de acá: **la seña ya se cuenta hoy** —está en la hoja de
closers, entre ofertas y cierres— y **los closers ya vienen agregados por mes**,
no por oportunidad. Esto último es decisivo para la migración (Parte 13).

### 1.2 · Analizador de llamadas (`synoma`)

**Qué hace.** Se pega una transcripción, se manda a Claude, y devuelve un análisis
largo: score general, adherencia al script, fases, objeciones, errores críticos,
perfil del prospecto, feedback y ejercicio de entrenamiento.

**Tablas** (migración `013_call_analyzer_tables.sql`):

```
calls              id, cliente_id, playbook_version, salesperson_name,
                   prospect_name, call_date, transcript, status, call_result
call_analyses      id, call_id, cliente_id, scores(jsonb), observations,
                   summary, overall_score, full_analysis(jsonb)
sales_playbooks    id, cliente_id, name, offer_text, script_text, version, is_active
```

**Cómo calcula el score hoy.** No lo calcula: se lo pide al modelo.
`supabase/functions/analyze-call/index.ts` manda un prompt que pide un JSON con
`overall_score` adentro, y lo guarda tal cual viene. No hay pesos, ni topes, ni
penalizaciones, ni bonificaciones, ni versión del modelo de scoring.

**Esta es la causa exacta del 7,4 de la Parte 10.2.** Un modelo de lenguaje al
que se le pide «poné una nota del 0 al 10» pone la nota que pondría una persona
amable: se apoya en lo que salió bien y promedia. No es un problema del prompt,
es un problema de *quién* hace la aritmética.

**Otras cosas del analizador que no sobreviven tal cual:**

- Es **síncrono**: la Edge Function llama a Claude y espera dentro del request.
  Hay estados (`pending`/`analyzing`/`completed`/`failed`) pero no hay cola. Si
  la llamada tarda, el usuario ve un error y la fila queda en `analyzing`.
- Las políticas RLS son `USING (true)` en las tres tablas. El aislamiento real lo
  hace la función con la service role key; la RLS no separa a nadie de nadie.
- Todo el análisis se guarda en **un JSON gigante** (`full_analysis`). El
  documento maestro lo prohíbe explícitamente en la Parte 16, y con razón: sobre
  un jsonb no se calculan percentiles, ni evoluciones, ni patrones por closer.
- Cuelga de `clientes`, que son los **clientes del programa**, no el equipo
  comercial de Founders. El analizador está construido para que cada cliente
  analice *sus* llamadas con *su* playbook. Ver la pregunta 4 de la Parte 15.
- El `talk_ratio` se lo pide al modelo. Eso se cuenta en código.

### 1.3 · Biblioteca comercial (`clientes`)

Dos pestañas —Clientes y Lead Magnets— sobre dos bases de Notion, más un
asistente que sugiere recursos para un lead. Es exactamente la **Nutrición** de
la Parte 13.5 y los **Casos de éxito** de la 13.6, a medio camino: el material ya
está catalogado, pero vive en Notion y la recomendación no mira ni la objeción,
ni la industria, ni la etapa del lead, porque no tiene de dónde leerlas.

### 1.4 · Founders Brain (`founders-brain`) — el post-venta

No es parte del Sales OS, pero **es la base de código que hay que reutilizar**.
Es lo más nuevo, lo más prolijo y ya resolvió media docena de problemas que el
Sales OS va a tener igual.

Lo que sirve tal cual:

| Archivo | Qué resuelve |
|---|---|
| `src/lib/db.ts` | Conexión directa por `pg` y **escrituras verificadas**: cada escritura declara cuántas filas tenía que tocar y rompe si no coinciden. |
| `src/lib/permisos.ts` | El alcance viaja como **argumento obligatorio** de cada consulta. Si alguien agrega una pantalla y se olvida de filtrar, no compila. |
| `src/lib/auth.ts` | Sesión por cookie `httpOnly` contra tabla propia. Roles en `usuarios`. |
| `src/lib/revision.ts` | Antes de tocar la base chequea el esquema entero y dice *qué migración falta*, en vez de reventar. |
| `src/lib/migraciones.ts` + `scripts/migrar.mjs` | Migraciones idempotentes aplicadas en orden, con `npm run migrar` y `npm run esquema`. |
| `src/lib/modelo.ts` | Cliente de Anthropic con **registro de costo por llamada** (`llamadas_modelo`), streaming, prompt caching y errores traducidos con el arreglo al lado. |
| `campo_historial` (migración 0009) | Historial por campo: valor anterior, valor nuevo, origen, cita, usuario. Es la Parte 7.4 ya construida. |
| `src/componentes/CampoEditable.tsx` | Edición en el lugar, en cualquier pestaña. Es la Parte 7.3. |
| `src/app/error.tsx`, `global-error.tsx` | Pantallas de error legibles en vez de «Application error». |
| `src/lib/campos.ts` | **Registro de campos**: una sola lista define qué datos existen, cómo se mapean desde la planilla, qué falta y cómo se dibuja la ficha. |

Las tablas que ya existen ahí y que el Sales OS **no** debe duplicar:
`usuarios`, `sesiones_login`, `llamadas_modelo`, `campo_historial`.

---

## Parte 2 · Deuda técnica

Ordenada por lo que más duele.

**1 · El dashboard inventa números cuando falla.** En `lib/sheets.js`, cada
lectura hace `catch → return getMockXData()`. Si el Apps Script no contesta, la
pantalla muestra **datos ficticios generados con una semilla**, sin avisar. Es el
mismo modo de falla que la propia evaluación de Synoma documentó en julio («entra
en modo demo, mostrando contenido inventado como si fuera el plan del cliente»).
Un tablero que miente cuando se rompe es peor que un tablero roto. **Esto no se
migra.**

**2 · El score lo pone el modelo.** Ya explicado en 1.2. Sin motor determinista
no hay calibración posible, porque no hay nada que calibrar.

**3 · No hay entidad lead ni oportunidad.** De acá salen: no se puede editar, no
se puede reasignar, no se puede reconstruir la historia, no se puede atribuir un
cierre, no se puede hacer matching. Todo lo demás del documento maestro depende
de resolver esto primero.

**4 · La inteligencia en un JSON gigante.** `full_analysis` es cómodo para
mostrar y es inútil para aprender.

**5 · No hay cola de trabajos en ninguno de los seis repos.** Ni tabla, ni cron,
ni reintentos. Todo lo que cuesta tiempo corre dentro de un request.

**6 · No hay audit log del lado comercial.** Quién reasignó, quién cambió un
resultado, quién tocó un importe: no queda registro en ninguna parte.

**7 · El porcentaje de comisión es una constante en el código**
(`app-comercial/lib/calculos.js`). La Parte 17 pide que toda variable de negocio
se cambie desde la app.

**8 · Dos bases de código paralelas para el post-venta** (`fbrain` y
`founders-brain`). No es problema del Sales OS, pero conviene saberlo antes de
copiar de la equivocada: la buena es `founders-brain`.

**9 · La escritura de agendas pasa por Slack → Zapier → Apps Script.** Funciona,
y hay que decidir si sigue siendo la puerta de entrada (pregunta 2 de la Parte 15).

---

## Parte 3 · Lo que pide el documento contra lo que hay

| Parte | Módulo | Estado hoy | Dónde |
|---|---|---|---|
| 5.1 | Dashboard ejecutivo | **Parcial** — hay tarjetas y meses, faltan filtros, embudo, forecast | `claude/` |
| 5.2 | Embudo visual | **No existe** (los datos para armarlo, sí) | — |
| 5.3 | Objetivo mensual | **Parcial** — `objetivoPesos`, `objetivoVentas`, faltantes | `claude/` |
| 5.4 | Forecast | **No existe** | — |
| 5.5 | Tracker diario | **No existe** | — |
| 5.6 | Hipótesis del día | **No existe** | — |
| 5.7–5.8 | Home por rol | **No existe** — no hay roles | — |
| 5.9 | Metric tree | **No existe** | — |
| 6 | Seña como resultado propio | **Parcial** — se cuenta agregada por closer/mes | `claude/` |
| 7.1 | Vista central de leads | **No existe** | — |
| 7.2 | Registrar lead | **No existe** (entra por Zapier) | — |
| 7.3 | **Editar leads** | **No existe** — es el problema declarado | — |
| 7.4 | Historial de cambios | **No existe acá** — sí el patrón en `founders-brain` | `campo_historial` |
| 7.5 | Perfil 360 | **No existe** | — |
| 7.6 | Duplicados | **No existe** — sí el patrón (`texto.ts`, regla 3) | `founders-brain` |
| 7.7 | Buscador global | **No existe** | — |
| 8 | Lead Quality Score | **No existe** | — |
| 9 | Lead Intelligence | **Parcial** — `prospect_profile` dentro del JSON | `synoma` |
| 10.1 | Entrada de transcripción | **Existe** | `synoma` |
| 10.2 | Calibración del score | **No existe** — es el problema declarado | — |
| 10.3 | Scoring ponderado | **No existe** — hay `weight` por fase, no se usa | — |
| 10.4–10.6 | Caps, penalizaciones, bonos | **No existe** | — |
| 10.7 | Resultado ≠ ejecución | **Parcial** — el prompt lo dice, no está en el dato | `synoma` |
| 10.8 | Feedback priorizado | **Existe** y está bien pensado | `synoma` |
| 10.9 | Score por etapa | **Parcial** — `phases[].score` | `synoma` |
| 10.10 | Percentil / benchmark | **No existe** | — |
| 10.11 | Evolución del closer | **No existe** | — |
| 10.12 | Detección de patrones | **No existe** | — |
| 10.13 | Pipeline asíncrono | **No existe** — es síncrono | — |
| 10.14 | `scoring_config` versionado | **No existe** | — |
| 11.1 | Closers | **Existe, agregado por mes** | `claude/` |
| 11.2 | Setters | **No existe** — no hay entidad setter | — |
| 12 | Matching completo | **No existe** | — |
| 13.1–13.4 | Seguimientos | **Parcial** — próximo paso y fecha, sin kanban ni prioridad | `claude/` |
| 13.5–13.6 | Nutrición y casos | **Parcial** — en Notion | `clientes` |
| 14 | Comisiones | **Parcial** — porcentaje hardcodeado | `app-comercial` |
| 15 | AI Sales Manager, reportes, alertas | **No existe** | — |
| 16 | Modelo de datos normalizado | **No existe** para lo comercial | — |
| 17 | Roles y configuración | **No existe** | — |

Resumen honesto: **de los trece módulos de la navegación principal, ninguno está
completo y ocho no existen**. Lo que sí existe es valioso —las transcripciones,
la planilla histórica, el catálogo de material, y sobre todo las convenciones de
`founders-brain`— pero el Sales OS es una aplicación nueva, no un refactor.

---

## Parte 4 · Arquitectura propuesta

### 4.1 · Stack

Next.js 15 (App Router) · TypeScript · React 19 · Postgres en Supabase · Vercel ·
pgvector · Anthropic SDK.

**Postgres por conexión directa con `pg`, no con `supabase-js`.** Es la regla 8
de `founders-brain` y hay que sostenerla: `supabase-js` devuelve el error y sigue,
así que un permiso mal puesto termina informando «155 filas aplicadas» sobre una
base vacía. `pg` tira excepción, y `escribir()` además verifica cuántas filas
tocó. Un sistema que decide a quién mandarle un lead no puede tener escrituras
que fallan en silencio.

**RLS prendido y sin políticas**, como en `founders-brain`: la clave anónima no
entra a nada. Se entra por el servidor de la aplicación, con su sesión. (Esto
difiere de lo que hace `synoma` hoy, que tiene políticas `USING (true)`.)

### 4.2 · Capas

```
src/app/            Pantallas y route handlers. Nada de lógica de negocio.
src/componentes/    UI. Tonta: recibe datos calculados, no calcula.
src/dominio/        Reglas de negocio puras: qué es una seña, cuándo vence un
                    seguimiento, qué resultados puede tener una oportunidad.
src/motor/          EL MOTOR ESTADÍSTICO. Funciones puras, sin IA, sin base de
                    datos, con tests. Acá viven scoring, lead quality, match
                    score, confianza, forecast, prioridad de seguimiento.
src/ia/             LA CAPA DE MODELO. Sólo interpreta lenguaje y devuelve
                    estructura. Nunca devuelve una nota final.
src/datos/          Consultas. Toda consulta recibe el alcance como argumento.
src/trabajos/       Los jobs y el drenador de la cola.
src/lib/            Infraestructura: db, auth, permisos, migraciones, revisión.
```

### 4.3 · La frontera entre el modelo y el motor

Es la decisión de arquitectura más importante de todo el sistema, y la que
resuelve el 7,4.

```
El modelo NO devuelve:  notas finales, porcentajes, promedios, probabilidades,
                        tasas, percentiles, talk ratio.
El modelo SÍ devuelve:  niveles de rúbrica anclados (0–4) con cita textual
                        obligatoria, eventos de un vocabulario cerrado con cita,
                        y hechos estructurados (nicho, facturación, objeción,
                        rasgos psicológicos).
El motor hace:          pesos, topes, penalizaciones, bonificaciones,
                        percentiles, tasas, shrinkage, confianza, forecast.
```

Consecuencia práctica, y es grande: **recalibrar no cuesta una sola llamada al
modelo**. Como los niveles y los eventos quedan guardados fila por fila, cambiar
un peso o un tope es volver a correr el motor sobre lo que ya está. Se pueden
recalcular mil llamadas con la v1.4 en segundos y comparar la distribución contra
la v1.3 antes de decidir si se adopta.

### 4.4 · Nada que cueste plata corre solo

Heredado de `founders-brain` y vale igual acá: el análisis de una llamada corre
cuando alguien lo pide o cuando entra una transcripción nueva, nunca al abrir una
pantalla. Cada llamada al modelo queda registrada con sus tokens y su costo en
`llamadas_modelo`.

---

## Parte 5 · Modelo de datos

### 5.1 · Una aclaración sobre los nombres

El documento maestro lista las tablas en inglés (`leads`, `opportunities`,
`calls`…). Toda la base de código de la casa está en castellano —`clientes`,
`sesiones`, `campo_historial`, `escribir()`, `alcanceDe()`—. Mezclar los dos
idiomas en el mismo esquema es peor que elegir cualquiera de los dos.

**Propuesta: castellano**, con esta equivalencia contra el documento. Si preferís
inglés, se cambia ahora y no cuesta nada; después sí. (Pregunta 3 de la Parte 15.)

### 5.2 · Núcleo (Fase 0–1)

```sql
usuarios            id, email, nombre, rol, clave_hash, activo
                    rol ∈ (admin, direccion, head, closer, setter, coach)
sesiones_login      token, usuario_id, expira_en
closers             id, usuario_id, nombre, activo, zona_horaria, capacidad_semanal
setters             id, usuario_id, nombre, activo
fuentes             id, nombre, activa                     -- Meta Ads, Bio IG, Webinar…
funnels             id, nombre, activo
objetivos           id, ambito, ambito_id, periodo, tipo, valor
                    -- ambito ∈ (empresa, closer, setter); tipo ∈ (facturacion,
                    -- cash, ventas, agendas). Parte 11.2: configurable, no hardcodeado.

leads               id, nombre, nombre_clave, nombre_pleg, email, telefono, pais,
                    fuente_id, funnel_id, setter_id, notas, links, creado_en,
                    creado_por, borrado_en
                    -- nombre_clave/nombre_pleg: la regla 3 de founders-brain.
                    -- Nunca se borra: borrado_en (soft delete, Parte 16).

oportunidades       id, lead_id, closer_id, closer_inicial_id, tipo_sesion,
                    fecha_agenda, hora_agenda, estado, resultado, valor_potencial,
                    moneda, cerrada_en, motivo_perdida, borrado_en
                    -- resultado ∈ (pendiente, venta, sena, seguimiento, perdida,
                    --               no_show, cancelada, no_calificado, reagendada)
                    -- La seña NO cierra la oportunidad. Sigue abierta.

oportunidad_participaciones
                    id, oportunidad_id, closer_id, rol, llamadas, peso
                    -- rol ∈ (inicial, final, apoyo). Parte 12.9: el cierre no se
                    -- atribuye 100% al que firmó.

llamadas            id, oportunidad_id, closer_id, numero, fecha, duracion_seg,
                    asistio, resultado, tipo_sesion
transcripciones     id, llamada_id, texto, caracteres, origen, subida_por, creado_en
                    -- el texto largo vive aparte: ninguna lista lo arrastra al navegador

ventas              id, oportunidad_id, importe, moneda, fecha, programa, borrado_en
senias              id, oportunidad_id, importe, moneda, fecha, saldo_pendiente,
                    fecha_comprometida, estado
                    -- estado ∈ (abierta, convertida, perdida, vencida)
pagos               id, venta_id, importe, moneda, fecha, medio, estado, n_cuota, cuotas_totales
                    -- Cash collected sale de acá, nunca de ventas.

cambios             id, entidad, entidad_id, campo, valor_anterior, valor_nuevo,
                    usuario_id, motivo, creado_en
                    -- El audit log de la Parte 16. Mismo patrón que campo_historial.
trabajos            (ver Parte 9)
config              clave, valor(jsonb), version, vigente, creado_por, creado_en
                    -- Parte 17: toda variable de negocio se cambia desde la app.
```

### 5.3 · Analizador (Fase 2)

```sql
scoring_config      id, version, dimensiones(jsonb), penalizaciones(jsonb),
                    topes(jsonb), bonificaciones(jsonb), anclas(jsonb),
                    vigente, creado_en, creado_por
                    -- Nunca se edita una versión publicada. Se crea la siguiente.

analisis_llamada    id, llamada_id, transcripcion_id, scoring_config_id, estado,
                    modelo, creado_en
                    -- estado ∈ (subida, procesando, analizada, error)
analisis_niveles    id, analisis_id, dimension, nivel, cita, justificacion
                    -- Lo que devuelve el modelo. 0–4 con cita obligatoria.
analisis_eventos    id, analisis_id, evento, cita, momento_seg
                    -- Vocabulario cerrado: penalizaciones y bonificaciones.
analisis_objeciones id, analisis_id, tipo, textual, objecion_real, respuesta,
                    calidad_respuesta, mejor_respuesta
analisis_feedback   id, analisis_id, lo_mejor(jsonb), lo_que_costo(jsonb),
                    error_principal, que_hubiera_hecho, momento_clave,
                    frase_alternativa, una_sola_cosa
call_scores         id, analisis_id, scoring_config_id, score_final, score_base,
                    penalizacion_total, bonificacion_total, tope_aplicado,
                    vigente, creado_en
                    -- Una fila por versión de config. Nunca se pisa un histórico.
score_dimensiones   id, call_score_id, dimension, score, peso, aporte
```

Fijate que `call_scores` puede tener varias filas por análisis: eso es
literalmente «Call Score original 6.4 (v1.3) · recalculado 6.1 (v1.4)».

### 5.4 · Inteligencia (Fase 4)

```sql
lead_features       id, lead_id, familia, clave, valor_texto, valor_numero,
                    score, cita, origen, creado_en
                    -- familia ∈ (negocio, situacion, psicologia, compra)
                    -- Normalizada, no un JSON. Sobre esto se hacen cohortes.
lead_quality_config id, version, pesos(jsonb), vigente, ajustado_en, n_muestra
lead_quality_scores id, lead_id, oportunidad_id, config_id, score, nivel,
                    aportes(jsonb), creado_en
                    -- Se congela por oportunidad. Ver 12.3.
closer_features     id, closer_id, segmento_tipo, segmento_valor, n, conversiones,
                    tasa_cruda, tasa_ajustada, lift, confianza, calculado_en
objeciones          id, tipo, nombre, activa
```

### 5.5 · Matching (Fase 5)

```sql
match_config        id, version, pesos(jsonb), epsilon_exploracion, vigente
embeddings          id, entidad, entidad_id, vector, modelo, creado_en
                    -- pgvector. Índice ivfflat / hnsw sobre vector.
match_scores        id, lead_id, closer_id, match_config_id, score, confianza,
                    n_comparables, componentes(jsonb), calculado_en
match_recomendaciones id, lead_id, mejor_performance_id, mejor_disponible_id,
                    explicacion(jsonb), modo, aceptada, closer_final_id
                    -- modo ∈ (optimizada, exploracion). Registrar el modo es lo
                    -- que después permite estimar sin sesgo.
aprendizajes_semanales id, semana, titulo, texto, evidencia(jsonb), creado_en
```

### 5.6 · Seguimientos, nutrición, comisiones (Fases 3 y 6)

```sql
seguimientos        id, oportunidad_id, closer_id, dia_secuencia, vence_en,
                    estado, prioridad, ultima_interaccion, borrado_en
seguimiento_interacciones id, seguimiento_id, canal, que_se_hizo, resultado, creado_en
material            id, titulo, tipo, url, activo
material_tags       material_id, tag
material_recomendado id, lead_id, material_id, score, motivo, enviado_en
casos_exito         id, titulo, nicho, facturacion, problema, objecion, oferta,
                    resultado, pais, ticket, material_id
comisiones          id, venta_id, usuario_id, rol, base, porcentaje, importe,
                    estado_pago, pagado_en
                    -- base = cash collected, no facturación (Parte 14).
hipotesis_dia       id, fecha, ventas_estimadas, rango_min, rango_max,
                    ventas_reales, desviacion, explicacion
```

---

## Parte 6 · Rutas

```
/login
/                        Home por rol: redirige a la que corresponda
/tablero                 Dashboard ejecutivo (dirección, head)
/tablero/[metrica]       Metric tree: cualquier KPI abierto por dimensión
/hoy                     Tracker diario + hipótesis del día
/leads                   Vista central, con filtros rápidos
/leads/nuevo             Registrar lead (con detección de duplicados)
/leads/[id]              Perfil 360 · pestañas: resumen, inteligencia, llamadas,
                         seguimientos, nutrición, historial
/llamadas                Mis llamadas (closer)
/analizador              Subir / pegar transcripción
/analizador/[id]         Análisis: score por etapa, feedback, percentil
/closers                 Comparativa
/closers/[id]            Closer Intelligence
/setters                 Objetivos y cumplimiento
/setters/[id]
/matching                Matriz visual + recomendaciones pendientes
/matching/[leadId]       Recomendación explicada + Lead Brief
/seguimientos            Kanban por día de secuencia
/casos                   Casos de éxito y biblioteca de nutrición
/comisiones
/coaching                Prioridades de entrenamiento (head, coach)
/configuracion           Objetivos, pesos, scoring, fuentes, funnels, estados
/configuracion/scoring   Editor de scoring_config + simulador de recalibración
/datos                   Calidad de datos: qué falta, qué está inconsistente
```

---

## Parte 7 · Componentes

Base visual heredada de `claude/components/ui` (`StatCard`, `DataTable`,
`MonthSelector`, `TabNav`), más lo que pide la Parte 2:

```
Numero.tsx           Un número grande con su unidad y contra qué se compara.
                     Nunca un número solo.
Semaforo.tsx         Cuatro colores, no tres: gris no es verde. El color siempre
                     va con su palabra al lado. (Patrón de founders-brain.)
Embudo.tsx           Etapas con cantidad y % de paso.
Gauge.tsx            Objetivo mensual: alcanzado, ritmo esperado, ritmo real.
BarrasPorEtapa.tsx   El score por dimensión de la Parte 10.9.
Percentil.tsx        Dónde cae una llamada contra la población.
TarjetaLead.tsx      Para el kanban y las listas.
Kanban.tsx           Columnas configurables.
MatrizAfinidad.tsx   La matriz de la Parte 12.13.
Explicacion.tsx      Nunca un score sin su desglose. Se abre y muestra los aportes.
CampoEditable.tsx    De founders-brain. Edición en el lugar.
Historial.tsx        Quién cambió qué, cuándo y por qué.
BuscadorGlobal.tsx   Nombre, email, teléfono, closer, empresa.
```

Regla que vale para todos: **el componente no calcula**. Recibe lo que el motor
ya calculó. Si una barra sabe sumar, la lógica está en el lugar equivocado.

---

## Parte 8 · APIs

Los formularios normales van por **server actions**. Lo que sube archivos o
transcripciones largas va por **route handler**, porque una server action tiene
tope de 1 MB y en `founders-brain` eso ya trabó una carga sin decir por qué.

```
POST  /api/transcripciones        Sube o pega. Guarda y encola. Devuelve enseguida.
POST  /api/importar               CSV histórico (planilla madre comercial)
GET   /api/plantilla              Baja la planilla, vacía o con los datos de hoy
POST  /api/trabajos/correr        Drenador de la cola. Protegido por CRON_SECRET.
GET   /api/buscar?q=              Buscador global
POST  /api/preguntar              AI Sales Manager (streaming)
GET   /api/metricas/[clave]       Metric tree: una métrica abierta por dimensión
POST  /api/leads/[id]/asignar     Cambiar closer. Escribe en `cambios`.
```

---

## Parte 9 · Jobs

### 9.1 · Por qué una tabla y no un servicio

Una función de Vercel se corta al minuto (cinco en el plan pago). Una
transcripción larga con dos pasadas al modelo no entra. Las opciones eran: un
worker aparte (infra nueva), Edge Functions con `pg_cron` (dos runtimes, dos
lugares donde mirar los logs) o una cola en la base drenada por cron.

**Cola en la base.** No agrega infraestructura, los estados que pide la Parte 3
(`Uploaded · Processing · Analyzed · Error`) son literalmente las filas de la
tabla, y el trabajo puede guardar su progreso y retomar en la invocación
siguiente si no llegó a terminar.

```sql
trabajos  id, tipo, referencia_id, estado, progreso(jsonb), intentos,
          max_intentos, tomado_hasta, error, creado_en, actualizado_en
          -- estado ∈ (pendiente, corriendo, hecho, error)
```

Se toma con `for update skip locked` y un lease, así dos invocaciones del cron
que se pisan no procesan la misma transcripción dos veces:

```sql
update trabajos
   set estado = 'corriendo', tomado_hasta = now() + interval '5 minutes',
       intentos = intentos + 1
 where id = (select id from trabajos
              where estado = 'pendiente'
                 or (estado = 'corriendo' and tomado_hasta < now())
              order by creado_en limit 1 for update skip locked)
returning *;
```

### 9.2 · Los trabajos

| Tipo | Cuándo | Qué hace |
|---|---|---|
| `analizar_llamada` | al entrar una transcripción | Las dos pasadas de la Parte 11, escribe niveles y eventos, corre el motor |
| `extraer_inteligencia` | al entrar un lead o una llamada | Llena `lead_features` |
| `calcular_embedding` | al cerrar una oportunidad | Vector del lead y de la llamada |
| `recalcular_scores` | al publicar una `scoring_config` | Recorre análisis y agrega filas nuevas a `call_scores`. **No toca las viejas** |
| `recalibrar_matching` | semanal | `closer_features`, `match_scores` |
| `aprendizajes` | semanal | Genera los learnings de la Parte 12.15 |
| `hipotesis_dia` | diario, temprano | Calcula la estimación del día |
| `cierre_dia` | diario, tarde | Compara hipótesis contra realidad |
| `alertas` | cada hora | Seguimientos vencidos, señas por vencer, objetivos |

Cron de Vercel cada minuto contra `/api/trabajos/correr`, más los cron diarios y
semanales.

---

## Parte 10 · Scoring engine

### 10.1 · Por qué el promedio da 7,4

Tres razones, y las tres se arreglan distinto:

1. **El modelo pone la nota.** Se le pide un número y devuelve el número
   socialmente correcto. → El motor pone la nota.
2. **Una escala continua sin anclas no discrimina.** «¿Del 0 al 10, qué tan bien
   descubrió?» no tiene respuesta verificable. → Rúbrica anclada de cinco niveles
   con descriptor de conducta.
3. **El promedio compensa.** Rapport 9 tapa Descubrimiento 3. → Topes.

### 10.2 · Rúbrica anclada

Cada dimensión tiene cinco niveles con una conducta observable, no un adjetivo.
Ejemplo de Descubrimiento:

```
0  No preguntó. Habló de la oferta desde el minuto uno.
1  Preguntas de encuadre («¿a qué te dedicás?») y nada más.
2  Preguntó por la situación pero no repreguntó sobre ninguna respuesta.
3  Repreguntó al menos una vez y llegó a un dato que el prospecto no había ofrecido.
4  Llegó a la causa: el prospecto dijo algo que no sabía que iba a decir, y el
   closer lo usó después en la conversación.
```

El modelo devuelve el nivel **con la cita que lo sostiene**. Sin cita, el nivel
no entra: se marca `sin_evidencia` y esa dimensión no suma (es la regla de
`founders-brain`: sin cita textual no se afirma nada).

El motor mapea nivel → 0–10 con una curva guardada en `scoring_config`. Arranque
propuesto, deliberadamente duro:

```
nivel 0 → 1.0    nivel 1 → 3.0    nivel 2 → 5.0    nivel 3 → 7.0    nivel 4 → 9.0
```

Un 7 es «hizo bien lo que tiene que hacer». Para pasar de 8 hay que tener varios
4. Un 9 pide cuatro en casi todo, y por eso es raro.

### 10.3 · El cálculo

```
base       = Σ (score_dimension × peso)            pesos de scoring_config
penal      = Σ penalizaciones de los eventos detectados
bono       = Σ bonificaciones de los eventos detectados   (tope: +0.5 en total)
bruto      = base − penal + bono
final      = min(bruto, tope_aplicable)            clamp 0–10
```

Pesos de arranque (Parte 10.3): Descubrimiento 20 · Dolor 15 · Diagnóstico 15 ·
Valor 15 · Oferta 10 · Objeciones 10 · Control 10 · Cierre 5.

Topes (Parte 10.4): Descubrimiento < 5 → máximo 7.0 · Diagnóstico < 5 → máximo
6.8 · sin profundización de dolor → máximo 6.0. Se aplica el más bajo.

Penalizaciones y bonificaciones salen del vocabulario cerrado de eventos de la
Parte 10.5 y 10.6, y **cada evento necesita cita**, igual que los niveles.

El ejemplo del documento se comporta como tiene que comportarse: Rapport 9,
Energía 9, Comunicación 9, Descubrimiento 3, Diagnóstico 3, Objeciones 4 da base
≈ 5,3 y tope 6,0 → **5,3**, no 7,2.

### 10.4 · Calibración y percentil, que no son lo mismo

- **El score es absoluto.** Una llamada de marzo y una de septiembre se comparan
  directo mientras compartan versión de config. Por eso no se normaliza contra
  la población: eso haría que mejorar todo el equipo no mueva ninguna nota.
- **El percentil es relativo** y se calcula aparte, contra las llamadas analizadas
  con la misma versión. Es la Parte 10.10.

Cómo se calibra: con volumen (≥100 llamadas) se mira la distribución real contra
la objetivo de la Parte 10.2. Si el promedio quedó alto, se ajustan anclas, topes
o pesos, se publica una versión nueva, y el trabajo `recalcular_scores` agrega
filas nuevas. **Se comparan las dos distribuciones antes de marcar vigente la
nueva.** Nunca se pisa un score histórico.

### 10.5 · Resultado ≠ ejecución

`analisis` y `oportunidades.resultado` son tablas distintas y no se tocan. En la
pantalla se muestran juntos y sin mezclar: *Call Score 8.1 · Resultado No venta ·
Lead Quality 42*. El Call Score nunca entra como variable del resultado ni al
revés; si entrara, el analizador aprendería a premiar las llamadas que cerraron,
que es exactamente lo que el documento prohíbe.

---

## Parte 11 · AI pipeline

### 11.1 · Dos pasadas sobre la misma transcripción

```
1 · LECTURA        Segmentos y momentos, objeciones con cita, hechos del
                   prospecto (negocio, situación, psicología, compra).
                   → lead_features, analisis_objeciones
2 · EVALUACIÓN     Por dimensión: nivel + cita + una línea de justificación.
                   Eventos del vocabulario cerrado, con cita y momento.
                   → analisis_niveles, analisis_eventos
3 · MOTOR          (sin modelo) pesos, topes, penalizaciones, percentil.
                   → call_scores, score_dimensiones
4 · FEEDBACK       Lo mejor, lo que costó, el error que más impactó, la frase
                   alternativa, «si sólo cambiás una cosa».
                   → analisis_feedback
```

La transcripción viaja una sola vez y se cachea (`cache_control`), así la segunda
pasada se paga a una fracción. Es el mismo patrón que ya usa
`founders-brain/src/lib/modelo.ts`.

### 11.2 · Lo que se calcula en código y hoy se le pregunta al modelo

El **talk ratio** sale de contar turnos de la transcripción, no de la impresión
del modelo. Lo mismo la duración, el momento en que aparece el precio por primera
vez, y cuántas preguntas hizo el closer. Son cosas contables: contarlas.

### 11.3 · Registro de costo

Cada llamada al modelo escribe en `llamadas_modelo` (tokens de entrada, salida,
cache leído y escrito, costo en USD, ms, error). Ya existe en `founders-brain` y
se copia tal cual. Sin eso, «nada corre solo porque cuesta plata» es una promesa
sin número al lado.

---

## Parte 12 · Matching engine

### 12.1 · El problema real no es el promedio, es el tamaño de la muestra

«Kevin convierte 60% con consultores» sobre 5 oportunidades no es una tasa, es
ruido. La solución no es mostrar un aviso: es **encoger la tasa hacia el promedio
del equipo** en proporción a lo poco que se sabe.

```
tasa_ajustada = (conversiones + k × tasa_equipo) / (n + k)      k ≈ 20
```

Con n=5 la tasa dice casi lo que dice el equipo; con n=100 dice casi lo que dice
el closer. El `k` sale de `match_config` y se calibra con datos.

La **confianza** se reporta aparte, del ancho del intervalo de Wilson y de n:
alta / media / baja. Nunca se mezcla con el Match Score. Es la Parte 12.6.

### 12.2 · Normalización por Lead Quality

El círculo vicioso de la Parte 12.7 se corta comparando contra lo esperado, no
contra el promedio crudo:

```
p_esperada = probabilidad de cierre según el Lead Quality de esos leads
lift       = tasa_ajustada / p_esperada
```

Un closer que convierte 50% con leads de calidad 87 y otro que convierte 30% con
leads de calidad 54 pueden tener el mismo lift. **El ranking se hace por lift, no
por tasa cruda.** Las dos se muestran, porque la cruda también hay que verla.

### 12.3 · El Lead Quality se congela

Cuando se asigna un lead se guarda su score de ese momento en
`lead_quality_scores`. Si después se recalibra el modelo de calidad, el score
nuevo no puede reescribir la historia: la performance del closer se normaliza
contra la calidad que el lead tenía *cuando se lo asignaron*. Si no, cada
recalibración cambiaría retroactivamente qué tan bien trabajó cada uno.

### 12.4 · Match Score

Suma ponderada, pesos en `match_config`, arranque el de la Parte 12.5 (industria
15 · nivel de negocio 10 · ticket 10 · psicología 15 · objeción 15 · performance
comparable 20 · reciente 10 · confianza 5). Cada componente queda guardado en
`match_scores.componentes`, así la explicación de la Parte 12.12 no se redacta:
se lee.

### 12.5 · Embeddings

Un vector por lead (de sus features y del texto del formulario y notas) y uno por
llamada. Para un lead nuevo se buscan las N oportunidades más parecidas con
pgvector y se mira qué closers las tomaron y cómo les fue. Entra como un
componente más, no como el veredicto: encuentra patrones fuera de las categorías
predefinidas, y también encuentra parecidos que no significan nada.

> Anthropic no tiene API de embeddings. Hay que elegir proveedor (Voyage, u
> OpenAI `text-embedding-3-small` a 1536 dimensiones, que es lo que ya usaba
> `fbrain`). Pregunta abierta, no bloqueante: pega en `vector(n)`.

### 12.6 · Exploración

10% de las asignaciones son experimentales, con guardas: nunca en leads de valor
potencial alto, nunca en un closer sin capacidad. Lo importante no es el 10%: es
que **queda registrado en `match_recomendaciones.modo`**. Sin saber qué leads se
asignaron por optimización y cuáles por exploración, los datos futuros están
sesgados por la política de asignación y ninguna tasa significa lo que parece.

### 12.7 · Capacidad

`mejor_performance` y `mejor_disponible` se calculan los dos y se muestran los
dos. La disponibilidad sale de la agenda, las oportunidades abiertas, los
seguimientos pendientes y el huso horario. La decisión la toma una persona.

### 12.8 · Atribución

`oportunidad_participaciones` guarda quién tocó cada oportunidad y en qué rol. La
regla de reparto por defecto es una decisión de negocio, no técnica → pregunta 5
de la Parte 15. Mientras no se defina, se guarda la participación completa y se
reporta el cierre a nombre de los dos, sin repartir.

---

## Parte 13 · Migraciones y datos históricos

### 13.1 · Qué se puede traer

| Origen | Qué entra | Cómo |
|---|---|---|
| Planilla `agendas` | Leads con fecha, nicho y fuente | Importador CSV → `leads` |
| Planilla `llamadas` | Oportunidades con closer, resultado, próximo paso | → `oportunidades`, `seguimientos` |
| Planilla `cobranzas` | Pagos reales con medio y estado | → `pagos` |
| Planilla `negocio` | Objetivos y totales por mes | → `objetivos`, `historico_mensual` |
| Planilla `closers` | Agregados por closer y mes | → `historico_mensual` **(no se desagrega)** |
| Planilla `anuncios` | Inversión y costo por agenda | → `historico_mensual` |
| `synoma.calls` | Transcripciones con su resultado | → `transcripciones` |
| `synoma.call_analyses` | Análisis viejos | → archivo, marcados `v0`. Ver 13.3 |
| Notion (`clientes`) | Material y casos de éxito | → `material`, `casos_exito` |

### 13.2 · Lo que no se puede reconstruir, y no se va a inventar

La hoja `closers` trae **agregados mensuales**: 42 agendadas, 31 asistencias, 9
ofertas, 3 señas, 2 cierres. De ahí no salen oportunidades individuales. Fabricar
42 filas para que el número cuadre es exactamente lo que el documento prohíbe en
la Parte 16 («la IA no compensa datos basura»), y además envenenaría el matching
con oportunidades inventadas.

Van a una tabla aparte, `historico_mensual`, que sirve para dibujar la tendencia
histórica del tablero y **no alimenta ningún motor**. Las pantallas que muestren
tendencia tienen que poder decir de dónde sale cada tramo.

### 13.3 · El riesgo más serio: los scores viejos

Los análisis de `synoma` tienen `overall_score` puesto por el modelo, con el
sesgo de la Parte 10.2. Si entran al mismo pozo que los nuevos:

- los percentiles quedan mal desde el primer día,
- la evolución de cada closer muestra una caída inventada el día que se cambia
  el motor,
- los benchmarks del equipo arrancan corridos hacia arriba.

**Regla:** las transcripciones y los resultados entran; **los scores viejos no
entran a ninguna estadística.** Se guardan como `scoring_config_id = v0` y quedan
excluidos de percentiles, benchmarks y evoluciones. Las transcripciones se
reanalizan con la v1 en background, y ahí sí cuentan.

### 13.4 · Otros riesgos

- **Leads duplicados entre fuentes.** La misma persona puede estar en la hoja de
  agendas, en la de llamadas y en Notion. El importador usa el patrón de la regla
  3 de `founders-brain`: se busca por clave exacta, el parecido se **informa** y
  la fila no entra sola. Unir dos registros es una acción de una persona.
- **Meses en castellano y fechas en dos formatos** (`dd/MM/yyyy` y `yyyy-MM-dd`)
  conviviendo en la planilla. Ya hay normalizador en `lib/sheets.js`; se porta y
  se le agregan tests.
- **Moneda.** Hoy la planilla mezcla pesos y dólares según la hoja. Toda columna
  de dinero lleva su moneda; sin eso, cualquier suma del tablero está mal.
- **La primera carga no entra por pantalla.** Una función de Vercel se corta al
  minuto. Como en `founders-brain`, la carga inicial va por línea de comandos
  (`npm run importar`) con el mismo código y el mismo reporte.
- **Nada se borra.** `borrado_en` en todo lo que representa historia comercial.

---

## Parte 14 · Fases y prioridades

### Fase 0 · Fundaciones — 1 semana

Lo que la Fase 1 del documento da por supuesto. Auth y sesión, `usuarios` con los
seis roles, `alcanceDe()` extendido, migraciones, `revision.ts`, pantallas de
error, tabla `config`, tabla `cambios` (audit), tabla `trabajos` y el drenador,
registro de costo del modelo. Casi todo se copia de `founders-brain`.

### Fase 1 · Foundation

`leads`, `oportunidades`, `llamadas`, closers, setters, fuentes, funnels,
resultados, señas, ventas, pagos. **Editar leads y reasignar closer con
historial** (la Parte 7.3, que es lo que más duele hoy). Perfil 360. Duplicados.
Buscador global. Dashboard ejecutivo con embudo, objetivo y metric tree. Tracker
diario. Importador de la planilla histórica.

*Al terminar la Fase 1 el equipo ya puede dejar la planilla.* Ese es el corte.

### Fase 2 · Analyzer

`scoring_config` versionado, las dos pasadas, motor de scoring con topes y
penalizaciones, feedback priorizado, score por etapa, percentil, evolución del
closer, editor de configuración con **simulador**: antes de publicar una versión
nueva se ve cómo quedaría la distribución sobre las llamadas ya analizadas.

### Fase 3 · Follow-up

Kanban con columnas configurables, Follow-up Priority Score, dashboard de
seguimientos, biblioteca de nutrición migrada desde Notion, casos de éxito.

### Fase 4 · Intelligence

`lead_features`, Lead Quality Score v1 (pesos expertos, explicable), Lead
Intelligence, Closer Intelligence, cierre ajustado por calidad.

### Fase 5 · Matching

Embeddings, Match Score, confianza con shrinkage, recomendación explicada, Lead
Brief, atribución, exploración, capacidad, matriz visual.

### Fase 6 · Sales Brain

Patrones, forecast, hipótesis del día con su cierre, AI Sales Manager,
aprendizajes semanales, alertas, reportes automáticos.

### Prioridad, si hay que elegir

1. **Fase 1 completa.** Sin la entidad lead no hay nada más. Y resuelve el
   problema que el documento marca como «resolver sí o sí».
2. **Fase 2.** Es el módulo con más valor por semana de trabajo, y cada
   transcripción que se analiza bien es materia prima para las fases 4 y 5.
3. **Fase 3.** Los seguimientos vencidos son plata que ya está sobre la mesa.
4. **Fases 4–5.** No se pueden adelantar: necesitan volumen. El Match Score con
   veinte oportunidades no es un match score, es una opinión con decimales.

---

## Parte 15 · Qué falta definir

Decisiones funcionales que **no voy a inventar**. Las cinco primeras bloquean; el
resto se pueden contestar sobre la marcha.

**1 · ¿Cuál es «el proyecto actual»?** Los dos repos a los que tengo permiso de
escribir están vacíos. ¿El Sales OS se construye nuevo en `fbrain-sales`
reutilizando las fundaciones de `founders-brain`, o hay que partir del dashboard
de `claude/`, o del analizador de `synoma`? Cambia todo el plan de migración.

**2 · ¿Por dónde entran las agendas?** Hoy: Slack → Zapier → Apps Script →
planilla. ¿Sigue siendo así y el Sales OS lee de ahí, se conecta directo a la
fuente (GoHighLevel, Calendly, Meta), o el setter carga a mano en la aplicación?
La Fase 1 se diseña distinto en cada caso.

**3 · La seña y la plata.** Tres preguntas que cambian todos los números del
tablero: ¿el importe de la seña cuenta en **Cash Collected**? ¿cuenta para el
**objetivo mensual**? ¿con qué probabilidad entra al **forecast**? Mi supuesto
por ahora: **sí a cash** (es dinero cobrado), **no al objetivo de facturación**
(no hay venta todavía), y al forecast con la probabilidad histórica de conversión
de seña a venta. Decime si es así.

**4 · Las transcripciones de `synoma`, ¿de quién son?** El analizador está armado
por `cliente_id` con playbook propio, o sea que parece pensado para que **cada
cliente del programa analice sus propias llamadas**. Si es así, esas
transcripciones **no sirven** para el matching de los closers de Founders, y la
Fase 5 arranca desde cero. ¿Hay transcripciones de llamadas de venta de Founders
en algún lado (Fathom, Fireflies, Zoom, Drive)?

**5 · Atribución del cierre.** Closer A toma la primera llamada, Closer B cierra
en la segunda. ¿Cómo se reparte para comisiones y para performance? ¿Mitad y
mitad, 30/70, el que cierra se lleva todo pero la performance se mide por
participación? Y para comisiones, ¿el criterio es el mismo?

**6 · Nombres del esquema: castellano o inglés.** Recomiendo castellano por
coherencia con el resto de la casa. Cambiarlo ahora no cuesta; después sí.

**7 · Autenticación.** Recomiendo la sesión por cookie de `founders-brain` en vez
de Supabase Auth: ya está resuelta, probada, y necesitamos igual una tabla
`usuarios` propia para los seis roles. El documento menciona Supabase Auth —
¿hay algún motivo (SSO, Google) para usarlo?

**8 · Objetivos.** ¿El objetivo mensual es sólo de empresa, o también por closer
y por setter? ¿Se define en USD, en pesos, o en los dos?

**9 · Moneda.** ¿El sistema opera en USD, en pesos, o en ambos con conversión?
Si son ambos, ¿con qué cotización y quién la carga?

**10 · Las dimensiones del Call Score.** Las ocho de la Parte 10.3 están claras,
pero las **anclas de cada nivel** tienen que salir del método de Founders, no de
mí. Necesito, para cada dimensión, cómo se ve un 4 y cómo se ve un 1 en una
llamada real. Es media hora con quien entrena a los closers y es lo que define si
el analizador sirve.

**11 · Playbook.** ¿Hay un script único de Founders contra el que se evalúa, o
cada closer tiene el suyo? `synoma` tiene `sales_playbooks` por cliente.

**12 · Tipos de sesión.** «Primera sesión», «segunda sesión», «onboarding»
aparecen en el Tracker. ¿Cuál es la lista completa y cuáles cuentan como
oportunidad nueva?

**13 · Comisiones.** El porcentaje está hardcodeado hoy. ¿Es uno solo? ¿Cambia
por closer, por programa, por tramo de facturación? ¿El setter también comisiona?

**14 · Volumen.** ¿Cuántas llamadas por mes? De eso depende cuándo las fases 4 y
5 tienen sentido y cuánto va a costar el análisis mensual.

---

## Parte 16 · Lo que no se va a hacer sin justificarlo

Por la instrucción de la Parte 0 del documento maestro, dejo explícito qué de lo
que existe hoy propongo **no** conservar, y por qué:

| Se deja de usar | Por qué |
|---|---|
| El fallback a datos ficticios de `lib/sheets.js` | Un tablero que inventa números cuando falla es peor que uno caído. Se reemplaza por un aviso de que la fuente no contesta. |
| El `overall_score` del modelo | Es la causa del 7,4. La nota la pone el motor. |
| `full_analysis` como único almacenamiento | La Parte 16 lo prohíbe y sobre un jsonb no se calculan percentiles ni patrones. Se sigue guardando el JSON crudo **además**, para no perder nada. |
| Las políticas RLS `USING (true)` de `synoma` | No aíslan a nadie. Se reemplaza por RLS sin políticas + alcance obligatorio en el servidor. |
| La constante de comisión en el código | La Parte 17 pide configuración sin tocar código. |

Ninguna funcionalidad se elimina: el analizador, el dashboard, la biblioteca y
los seguimientos siguen existiendo, mejor conectados. Lo que se reemplaza son
cinco mecanismos internos, cada uno por un motivo que se puede discutir.
