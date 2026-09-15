# Founders Sales OS

El sistema operativo comercial de Founders. Todo gira alrededor del **lead**: una
persona con una historia completa —de dónde vino, quién la agendó, con qué closer
habló, qué pasó, cuánto se vendió y cuánto se cobró— que se puede reconstruir y
**corregir** sin borrar nada.

Esto es la **Fase 1**. Lo que hay hoy: entrar, cargar leads y sesiones, editarlos,
reasignar closers con historial, cargar resultados (venta, seña, seguimiento,
pérdida), y el tablero con embudo y objetivo. El analizador de llamadas, el Lead
Quality Score y el matching vienen después, en el orden de
[`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md).

---

## Cómo levantarla

Necesitás Node 22 y un proyecto de Supabase (o cualquier Postgres).

```bash
npm install
cp .env.example .env.local        # y poné ahí tu DATABASE_URL
npm run migrar                    # crea las tablas
npm run seed -- tu@email.com "Tu Nombre" tuclave
npm run dev                       # http://localhost:3000
```

`DATABASE_URL` sale de Supabase → **Connect** → la cadena del *pooler* en modo
transacción (puerto 6543). La conexión directa (5432) va sólo por IPv6 y desde
Vercel no se llega: es el error más común al publicar.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la aplicación en desarrollo |
| `npm run build` / `npm start` | Compila y sirve la versión de producción |
| `npm run typecheck` | Corre los tipos |
| `npm test` | Las pruebas. Las que escriben necesitan `DATABASE_URL_PRUEBAS` |
| `npm run migrar` | Aplica `supabase/migrations/*.sql` en orden |
| `npm run esquema` | Las imprime todas juntas, para pegar en el SQL Editor |
| `npm run seed -- <email> "<nombre>" <clave> [rol]` | Crea o actualiza un usuario |
| `npm run recorrido` | Maneja la aplicación con un navegador de verdad |

### Las pruebas corren sobre una base aparte

Hacen `truncate`. Si corrieran contra la base de trabajo se llevarían puesta la
operación entera. Por eso el interruptor es **otra variable**,
`DATABASE_URL_PRUEBAS`: sin ella, las que escriben se saltean solas.

```
Test Files  4 passed (4)
Tests       41 passed (41)
```

---

## Las decisiones que están tomadas, y por qué

### 1 · La seña es su propia categoría

Una seña significa que hubo intención real de compra **y** compromiso
financiero, pero todavía no hay venta. Entonces:

- **no** cuenta como venta ni suma a facturación;
- **no** entra a Cash Collected mientras esté abierta;
- **no** cierra la oportunidad: sigue abierta hasta convertirse o perderse;
- sí tiene su tarjeta, su etapa del embudo y su color propio —ni verde ni amarillo.

Cuando se convierte, su importe pasa a ser el **primer pago** de la venta. Así el
dinero se cuenta una vez: no dos, y no cero. Hay una prueba que lo verifica.

### 2 · Facturación y cash son dos tablas distintas

`ventas` es lo que se vendió. `pagos` es lo que se cobró. Salen de tablas
separadas y de fechas separadas: una llamada de septiembre que se cobra en
octubre es una agenda de septiembre y cash de octubre, y está bien así.

### 3 · Estado y resultado no son lo mismo

`estado` dice qué pasó con la reunión (vino, no vino, se canceló). `resultado`
dice qué pasó con la venta. Mezclarlos es lo que hace que después no se pueda
contestar «cuántas asistencias hubo» sin discutir.

### 4 · Todo se edita, nada se borra

Un lead se corrige después de creado —todos sus campos, incluido el closer— y
cada cambio deja quién, cuándo, de qué a qué y por qué en la tabla `cambios`. Al
reasignar, el **closer inicial no se pisa nunca**: sin él no se puede atribuir el
cierre más adelante.

### 5 · Un número nunca va solo

Cero y «sin datos» son cosas distintas. `tasa()` devuelve `null` cuando el
denominador es cero, porque «0% de asistencia» sobre cero agendadas es una
afirmación falsa con apariencia de dato. Y gris no es verde: verde es el color
que hace que nadie lo mire.

### 6 · Las monedas no se mezclan

Todo importe lleva su moneda. El tablero suma la moneda base y muestra el resto
**aparte**, avisando. Una suma con una cotización inventada es un número que
parece correcto y no lo es.

### 7 · El duplicado se avisa, no se decide

Antes de crear un lead se busca por email, por los **últimos 8 dígitos** del
teléfono (así «+54 9 11 5555-1234» y «11 5555 1234» se encuentran) y por nombre
plegado. Si aparece algo, no se crea: se muestra y decide una persona. Unir dos
registros es una acción explícita, nunca automática.

---

## Cómo está armado

```
src/dominio/     Qué es una seña, qué resultados existen, qué puede cada rol.
src/motor/       El motor estadístico: embudo, tasas, ritmo del objetivo, períodos.
                 Funciones puras, sin base de datos y sin IA. Acá van los tests.
src/datos/       Las consultas. Toda consulta recibe el alcance como argumento.
src/lib/         Conexión, sesión, permisos, revisión del esquema, texto.
src/componentes/ UI. Recibe lo que el motor ya calculó; no calcula.
src/app/         Pantallas y acciones de servidor.
supabase/        Las migraciones.
```

### Por qué se conecta así a Postgres

Por conexión directa desde el servidor con `pg`, no con `supabase-js`.
`supabase-js` devuelve el error y sigue, así que un permiso mal puesto termina
informando «155 filas aplicadas» sobre una base vacía. `pg` tira excepción, y
además en `src/lib/db.ts` **toda escritura declara cuántas filas tenía que tocar
y se verifica**. Un sistema que decide a quién mandarle un lead no puede tener
escrituras que fallan en silencio.

Las tablas tienen RLS prendido y **ninguna política**: la clave anónima de
Supabase no puede leer ni escribir nada, ni siquiera si se filtra. Se entra por
el servidor de la aplicación, con su sesión.

### El alcance viaja como argumento, no como buena intención

`src/lib/permisos.ts` define quién ve qué, y ese alcance es un **parámetro
obligatorio** de cada consulta que toca leads u oportunidades. Si mañana alguien
agrega una pantalla y se olvida de filtrar, no compila. Un filtro que depende de
acordarse no es un filtro.

### Si falta algo, la aplicación lo dice

Antes de tocar la base, el login y el marco revisan la conexión y el esquema
entero (`src/lib/revision.ts`). Si falta `DATABASE_URL`, si no se llega al
servidor, si la contraseña no es, si falta una migración —y dice **cuál**— o si
todavía no hay ningún usuario, sale una pantalla con el motivo y los pasos, en
vez de un «Application error» con un digest. Nunca muestra la cadena de conexión
ni la contraseña.

### Cada migración nueva hay que declararla

`npm run prebuild` corre solo antes del build y falla si hay una migración que
`revision.ts` no conoce. Es para que no pase lo de siempre: subir código que
depende de una tabla que en producción no existe.

---

## Publicar en Vercel

1. **Add New → Project** e importá este repositorio. El framework lo detecta solo.
2. En **Settings → Environment Variables** cargá `DATABASE_URL` con la cadena del
   **pooler** (6543, modo transacción).
3. Antes del primer deploy corré las migraciones una vez contra ese mismo
   proyecto: `npm run migrar` desde tu máquina, o pegá `npm run esquema` en el
   SQL Editor de Supabase.
4. Creá el primer usuario: `npm run seed -- tu@email.com "Tu Nombre" tuclave`.

La cookie de sesión sale con `Secure` en producción, así que la aplicación tiene
que servirse por HTTPS. En Vercel ya lo está.

---

## Qué falta, y en qué orden

El plan completo está en [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md).
Lo próximo, por dependencia:

1. **Analizador de llamadas** con el motor de scoring determinista (rúbricas
   ancladas, topes, penalizaciones y `scoring_config` versionado). La tabla
   `trabajos` ya está creada esperándolo.
2. **Seguimientos** en kanban con prioridad.
3. **Lead Quality Score**, que es lo que después permite comparar closers de
   verdad. Hasta que exista, la pantalla de Closers muestra el cierre bruto y
   **lo dice**: inventar el ajuste sería peor que no tenerlo.
4. **Matching**, que necesita volumen antes de significar algo.
