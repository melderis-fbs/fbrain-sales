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
| `npm run seed -- <email> "<nombre>" <clave> [rol]` | Crea o actualiza un usuario (el primero también se crea desde el navegador) |
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

## Conectar la base la primera vez

Se puede hacer entero desde el navegador, sin terminal. Son quince minutos.

Va con **[Neon](https://neon.tech)**, que es Postgres a secas y en el plan
gratuito no te topa en dos proyectos como Supabase. Si preferís Supabase, los
pasos son los mismos cambiando de dónde sale la cadena (ver más abajo): a la
aplicación le da igual, habla Postgres plano por `pg`.

### 1 · Crear la base

En [console.neon.tech](https://console.neon.tech) → **New Project**.

- **Name**: `founders-sales`
- **Region**: la más cercana. Para Argentina, `AWS South America (São Paulo)`.
- La versión de Postgres, la que venga.

### 2 · Copiar la cadena de conexión

Apenas se crea te la muestra; después está en **Connect** o en el panel
**Connection Details** del proyecto.

- Dejá **Connection pooling** prendido. La cadena tiene que decir **`-pooler`**
  en el nombre del host: desde una función de Vercel hay que entrar por el
  pooler, no por la conexión directa.
- Copiala con la contraseña incluida (hay un botón para mostrarla).

Queda así:

```
postgresql://neondb_owner:CLAVE@ep-nombre-123456-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require
```

Un retoque opcional: cambiá `sslmode=require` por **`sslmode=verify-full`**. Hoy
hacen exactamente lo mismo —el certificado se valida igual—, pero `require` está
por cambiar de significado en la próxima versión de `pg` y mientras tanto
imprime un aviso de deprecación en los logs.

### 3 · Crear las tablas

En el proyecto → **SQL Editor** → pegá los tres archivos de
`supabase/migrations/` en orden y ejecutá. Son idempotentes: correrlos dos veces
no rompe nada.

Tienen que quedar **19 tablas**. Se ven en **Tables**.

### 4 · Cargarla en Vercel

En el proyecto de Vercel: **Settings → Environment Variables**.

- **Key**: `DATABASE_URL`
- **Value**: la cadena del paso 2
- Marcá los tres entornos (Production, Preview, Development) → **Save**

**Redeployá.** Las variables se leen al construir: el deploy que ya estaba hecho
no se entera. En **Deployments**, en el último, los tres puntitos → **Redeploy**.

### 5 · Entrar

Abrí la URL. La aplicación te lleva sola a `/instalacion` y ahí creás el primer
usuario, que queda como admin. Esa pantalla se cierra apenas existe alguien.

En cada paso, si falta algo, la aplicación lo dice en pantalla con los pasos
para arreglarlo: no hay que mirar logs para saber qué falta.

> Neon **suspende** la base después de unos minutos sin uso y la despierta sola
> en el primer pedido. No hay que hacer nada: sólo que esa primera consulta
> tarda un segundo más.

### Si preferís Supabase

Cambia sólo de dónde sale la cadena. Botón **Connect** → **Connection string** →
**Transaction pooler**, la que termina en `:6543/postgres`. Dos cuidados:

1. Viene con `[YOUR-PASSWORD]` sin reemplazar, corchetes incluidos.
2. Tiene que ser la del pooler. La *Direct connection*, la de `5432`, va sólo
   por IPv6 y desde Vercel no se llega.

Y tené en cuenta que el plan gratuito permite **dos proyectos activos por
organización**, y que un proyecto sin uso se **pausa** a la semana y hay que
despertarlo a mano desde el dashboard.

## Publicar en Vercel

1. **Add New → Project** e importá este repositorio. El framework lo detecta solo.
2. Seguí los cinco pasos de arriba.

La cookie de sesión sale con `Secure` en producción, así que la aplicación tiene
que servirse por HTTPS. En Vercel ya lo está.

### Si el deploy falla

Estas dos están declaradas en el repo, así que Vercel no las tiene que adivinar:
`engines.node` en `package.json` (Next 15.5 necesita Node 20 o más) y
`vercel.json` con `framework: nextjs`, que fija el preset y el directorio de
salida.

Si igual falla, el build **no** es lo que hay que mirar primero: `npm ci` +
`npm run build` sobre un clon limpio, sin ninguna variable de entorno y sin
devDependencies, pasa. Entonces mirá la configuración del proyecto en Vercel:

| Dónde | Qué tiene que decir |
|---|---|
| Settings → General → Framework Preset | **Next.js**. Si el proyecto se creó cuando el repo estaba vacío, suele quedar en «Other» y el build termina en «No Output Directory named "public" found» |
| Settings → General → Root Directory | vacío — el proyecto está en la raíz del repo |
| Settings → General → Build & Development Settings | sin overrides: ni Build Command ni Install Command ni Output Directory |
| Settings → General → Node.js Version | 20 o más |
| Settings → Git → Production Branch | la rama donde está el código |

El error real siempre está en el **Build Log** del deployment, en la primera
línea roja. Es lo único que dice qué pasó.

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
