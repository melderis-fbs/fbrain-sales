# Founders Sales OS

El sistema operativo comercial de Founders. Todo gira alrededor del **lead**: una
persona con una historia completa —de dónde vino, quién la agendó, con qué closer
habló, qué pasó, cuánto se vendió y cuánto se cobró— que se puede reconstruir y
**corregir** sin borrar nada.

Un lead **es** una oportunidad de venta. Las llamadas que hagan falta para
cerrarla —una, dos o tres— cuelgan de él y no lo multiplican.

Lo que hay hoy: Dashboard y Tracker, leads con ficha por pestañas, calificación
del setter con Lead Quality, pipeline de seguimientos de 12 toques, comparativa
de closers con el cierre **ajustado por la calidad de los leads que recibió cada
uno**, setters, y el analizador de llamadas con rúbrica anclada y motor de
scoring determinista.

Falta la integración con GoHighLevel —hoy los leads se cargan a mano o se
importan—, el matching lead↔closer y las comisiones. El plan completo está en
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
Test Files  5 passed (5)
Tests       71 passed (71)
```

`npm run recorrido` es lo otro: maneja la aplicación entera con un navegador de
verdad —entrar, cargar un lead, calificarlo, señar, convertir la seña, mover una
tarjeta del pipeline— y verifica en pantalla lo que las pruebas verifican en la
base.

---

## Las decisiones que están tomadas, y por qué

### 1 · El lead **es** la oportunidad

María no es «un lead con dos oportunidades»: María es la oportunidad. Había una
capa de más, y era la que hacía que la misma persona apareciera tres veces en
una lista de leads. Las llamadas cuelgan del lead; la plata también.

Cuando un lead perdido se vuelve a abrir es **el mismo lead con un ciclo más**,
no uno nuevo: partirlo en dos registros perdería la historia justo cuando la
historia es lo que sirve. Y queda escrito **quién lo reflotó**, porque esa
repesca se cobra y suele hacerla el setter.

### 2 · Cada métrica está definida una sola vez

`src/datos/metricas.ts` es el único lugar donde se cuenta algo. Ninguna pantalla
hace su propia cuenta.

Existe por un problema concreto del sistema anterior: el tablero decía **111% de
cierre** y el tracker **11%** para el mismo mes. Ninguno estaba roto — contaban
sobre universos distintos. Las ventas salían de la tabla de ventas por fecha de
venta, y las asistencias de las reuniones del mes; dividir una cosa por la otra
da un número que no significa nada.

La regla ahora:

- todo el **embudo** —agendadas, asistencias, ofertas, señas, ventas— se cuenta
  sobre el mismo universo: los leads cuya reunión cayó en el período. El cierre
  es ventas sobre asistencias del mismo universo y **por construcción no puede
  pasar de 100%**;
- la **plata** se cuenta por su propia fecha: una venta en el mes que se firmó,
  un cobro en el mes que entró. Son universos distintos a propósito, y la
  pantalla lo dice en vez de esconderlo.

Hay una prueba que carga una venta de agosto cobrada en septiembre y verifica
que el cierre de septiembre siga siendo 0%.

### 3 · La seña es su propia categoría

Una seña significa que hubo intención real de compra **y** compromiso
financiero, pero todavía no hay venta. Entonces:

- **no** cuenta como venta ni suma a facturación;
- **no** entra a Cash Collected mientras esté abierta;
- **no** cierra la oportunidad: sigue abierta hasta convertirse o perderse;
- sí tiene su tarjeta, su etapa del embudo y su color propio —ni verde ni amarillo.

Cuando se convierte, su importe pasa a ser el **primer pago** de la venta. Así el
dinero se cuenta una vez: no dos, y no cero. Hay una prueba que lo verifica.

### 4 · Facturación y cash son dos tablas distintas

`ventas` es lo que se vendió. `pagos` es lo que se cobró. Salen de tablas
separadas y de fechas separadas: una llamada de septiembre que se cobra en
octubre es una agenda de septiembre y cash de octubre, y está bien así.

### 5 · Estado y resultado no son lo mismo

`estado` dice qué pasó con la reunión (vino, no vino, se canceló). `resultado`
dice qué pasó con la venta. Mezclarlos es lo que hace que después no se pueda
contestar «cuántas asistencias hubo» sin discutir.

### 6 · Todo se edita, nada se borra

Un lead se corrige después de creado —todos sus campos, incluido el closer— y
cada cambio deja quién, cuándo, de qué a qué y por qué en la tabla `cambios`. Al
reasignar, el **closer inicial no se pisa nunca**: sin él no se puede atribuir el
cierre más adelante.

### 7 · Un número nunca va solo

Cero y «sin datos» son cosas distintas. `tasa()` devuelve `null` cuando el
denominador es cero, porque «0% de asistencia» sobre cero agendadas es una
afirmación falsa con apariencia de dato. Y gris no es verde: verde es el color
que hace que nadie lo mire.

### 8 · Las monedas no se mezclan

Todo importe lleva su moneda. El tablero suma la moneda base y muestra el resto
**aparte**, avisando. Una suma con una cotización inventada es un número que
parece correcto y no lo es.

### 9 · El duplicado se avisa, no se decide

Antes de crear un lead se busca por email, por los **últimos 8 dígitos** del
teléfono (así «+54 9 11 5555-1234» y «11 5555 1234» se encuentran) y por nombre
plegado. Si aparece algo, no se crea: se muestra y decide una persona. Unir dos
registros es una acción explícita, nunca automática.

Y hay un caso que importa más que el duplicado: que el que ya está sea un lead
**perdido**. Ahí lo que corresponde no es crear otra ficha, es reflotarlo — y la
pantalla lo ofrece.

### 10 · El analizador no le pide una nota al modelo

Es la decisión que cambia el analizador entero. «¿Del 0 al 10, qué tan bien
descubrió?» no tiene respuesta verificable, y un modelo de lenguaje contesta lo
que contestaría una persona amable: de ahí salía que **todas** las llamadas
terminaran cerca de 7,4.

En lugar de eso, se le pide por dimensión en cuál de cinco descripciones de
**conducta observable** cae la llamada, y la **frase textual** que lo sostiene.
Sin cita, el nivel no entra. La nota la calcula el motor
(`src/motor/scoring.ts`) con los pesos, los topes y las penalizaciones.

Tres consecuencias:

- la misma llamada evaluada dos veces da la misma nota, porque no la improvisa
  nadie;
- **recalibrar no cuesta una llamada al modelo**: los niveles ya están
  guardados, así que cambiar un peso y repuntuar mil análisis son segundos. Con
  un analizador que guarda la nota, recalibrar es reanalizar — y reanalizar mil
  llamadas cuesta plata, así que no se hace nunca, así que el modelo de scoring
  no se corrige nunca;
- las notas viejas no se pisan: quedan con su versión de `scoring_config`, para
  poder comparar las dos distribuciones antes de adoptar la nueva.

Los **topes** son lo que rompe el 7,4 de verdad: una llamada impecable en todo
salvo descubrimiento da 7,8 promediando, y queda en 7,0. Sin descubrimiento no
se puede saber si lo que se vendió servía, y ningún cierre brillante lo compensa.

### 11 · A los closers se los compara por el índice, no por el cierre

Un closer que cierra 18% con leads flojos y otro que cierra 22% con leads buenos
están ordenados al revés en cualquier tabla que mire el 18 y el 22. Eso no es
sólo injusto: es cómo se rompe un equipo, porque el mejor closer aprende a pelear
por los leads buenos en vez de por las llamadas difíciles.

El **índice** compara lo que cerró contra lo que cerraría cualquiera con la
mezcla de leads que le tocó. 1,00 es rendir lo esperable. Con menos de ocho
asistencias no se publica: un número que se mueve veinte puntos con una venta más
se lee igual que uno sólido.

El nivel de calidad que se usa es el **congelado al asignar el lead**. Si se
usara el vigente, bastaría con bajarle la calidad a un lead después de perderlo
para mejorar el propio número. Hay una prueba que lo intenta.

### 12 · La cadencia de seguimientos se cuenta desde el último toque real

Doce toques con su día: 0, 1, 3, 7, 10, 15, 21, 35, 45, 60, 70, 80. Pero la fecha
de cada uno **no** se cuenta desde que el lead entró: se cuenta desde el último
toque que se hizo de verdad.

Con las fechas contadas desde el ingreso, un closer que se toma tres días para el
toque 2 abre la pantalla y encuentra los toques 3, 4 y 5 vencidos a la vez. Nadie
hace tres toques el mismo día: lo que pasa de verdad es que deja de mirar la
pantalla.

El pipeline no es una lista aparte de leads: es una **vista** de los leads que
quedaron en seguimiento. Un lead entra solo cuando el closer marca «seguimiento»
y sale solo cuando se vende, se pierde o se marca «no interesado». Si fuera una
lista propia se desincronizaría, y nadie sabría cuál de las dos pantallas tiene
razón.

---

## Cómo está armado

```
src/dominio/     Qué es una seña, qué resultados existen, la rúbrica del
                 analizador, la ficha de calificación, qué puede cada rol.
src/motor/       Funciones puras: embudo, tasas, ritmo del objetivo, períodos,
                 Lead Quality, scoring de llamadas, fechas de la cadencia y el
                 cierre ajustado. Sin base de datos y sin IA. Acá van los tests.
src/datos/       Las consultas. Toda consulta recibe el alcance como argumento.
                 `metricas.ts` es el único lugar donde se cuenta algo.
src/ia/          Las dos pasadas del analizador y el cliente del modelo, con el
                 gasto anotado en `llamadas_modelo`.
src/lib/         Conexión, sesión, permisos, revisión del esquema, texto.
src/componentes/ UI. Recibe lo que el motor ya calculó; no calcula.
src/app/         Pantallas y acciones de servidor.
supabase/        Las migraciones.
```

### Las pantallas

| Pantalla | Qué contesta |
|---|---|
| **Dashboard** | Cómo viene el mes, contra el anterior y contra el objetivo |
| **Tracker** | La planilla del equipo: qué hay agendado, qué pasó, qué falta cargar |
| **Leads** | Una fila por persona. La ficha tiene pestañas porque se completa en momentos distintos y por personas distintas |
| **Seguimientos** | El pipeline de 12 toques, con la tarjeta que se mueve sola |
| **Llamadas** | El analizador, la rúbrica a la vista y los playbooks |
| **Closers / Setters** | El equipo, con el cierre puesto en contexto |
| **Configuración** | Equipo, catálogos, objetivos, moneda base y la cadencia |

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

### 1 · Crear el proyecto

En [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.

- **Name**: `founders-sales`
- **Database Password**: usá **Generate a password** y **guardala** — no se vuelve
  a mostrar. Si la escribís vos, que no lleve `@ : / ? # [ ]`: rompen la cadena
  de conexión y hay que escaparlos a mano.
- **Region**: `East US (Ohio)` o `East US (N. Virginia)`. Lo que importa es la
  distancia entre la base y la función de Vercel, no entre la base y el
  navegador: Vercel corre por defecto en la costa este. Elegir São Paulo hace
  que cada consulta dé la vuelta.

Tarda un par de minutos en quedar lista.

### 2 · Copiar la cadena de conexión

Botón **Connect**, arriba. En **Connection string** elegí **Transaction pooler**:
la que termina en `:6543/postgres`.

Dos cosas que se pasan por alto, y son las que hacen perder la tarde:

1. **Reemplazá `[YOUR-PASSWORD]`** por la contraseña del paso 1, corchetes
   incluidos. La cadena viene con el marcador puesto.
2. **Tiene que ser la del pooler, puerto 6543.** La *Direct connection*, la de
   `5432`, va sólo por IPv6 y desde Vercel no se llega.

### 3 · Crear las tablas

**SQL Editor** → **New query** → pegá los archivos de
`supabase/migrations/` en orden y **Run**. Son idempotentes: correrlos dos veces
no rompe nada.

Tienen que quedar **32 tablas**, se ven en **Table Editor**.

### 4 · Cargarla en Vercel

**Settings → Environment Variables**.

- **Key**: `DATABASE_URL`
- **Value**: la cadena del paso 2, ya con la contraseña puesta
- Marcá los tres entornos (Production, Preview, Development) → **Save**

**Redeployá.** Las variables se leen al construir: el deploy que ya estaba hecho
no se entera. En **Deployments**, en el último, los tres puntitos → **Redeploy**.

### 5 · Entrar

Abrí la URL. La aplicación te lleva sola a `/instalacion` y ahí creás el primer
usuario, que queda como admin. Esa pantalla se cierra apenas existe alguien.
Después, en **Configuración → El equipo**, das de alta al resto.

En cada paso, si falta algo, la aplicación lo dice en pantalla con los pasos
para arreglarlo: no hay que mirar logs para saber qué falta.

> El plan gratuito permite **dos proyectos activos por organización**, y ya no
> deja pausarlos a mano: se auto-pausan solos tras una semana sin uso y hay que
> despertarlos desde el dashboard. Los pausados no ocupan slot.

### Si preferís otro Postgres

A la aplicación le da igual: habla Postgres plano por `pg` y le cede la decisión
del TLS a la cadena cuando trae `sslmode`. Con Neon, por ejemplo, la cadena sale
del botón **Connect** con *Connection pooling* prendido —el host tiene que decir
`-pooler`— y conviene cambiarle `sslmode=require` por `sslmode=verify-full`:
hacen lo mismo y evita un aviso de deprecación de `pg`.

## Publicar en Vercel

1. **Add New → Project** e importá este repositorio. El framework lo detecta solo.
2. Seguí los cinco pasos de arriba.

La cookie de sesión sale con `Secure` en producción, así que la aplicación tiene
que servirse por HTTPS. En Vercel ya lo está.

### Si el deploy falla, o el dominio no muestra lo último

Tres cosas que ya nos pasaron, en orden de cuál cuesta más ver:

**1 · Un deployment verde no quiere decir que el dominio sirva eso.**
En Vercel, producción queda clavada en el último deployment **promovido**, no en
el último que compiló. Se puede tener toda la lista en verde y el dominio
sirviendo un commit de hace semanas. Mirá en **Deployments** cuál tiene la
etiqueta **Production**: si no es el de arriba, sus tres puntitos →
**Promote to Production**.

Una pista que lo delata sin mirar nada más: **cuánto tardó el build**. Esta
aplicación tarda entre 25 y 40 segundos. Un «Ready 2s» es un commit sin
aplicación —documentación sola, por ejemplo—, y si ése es el que está en
producción, el dominio devuelve 404 porque no hay ninguna página que servir.

**2 · La versión de Node.**
Next 15.5 no corre en Node 18. Por eso `package.json` declara
`engines.node >= 20`: sin eso Vercel puede elegir una vieja y el build falla con
la aplicación intacta.

**3 · La rama de producción.**
**Settings → Git → Production Branch** (en Git, no en General) tiene que apuntar
a la rama donde está el código. Si apunta a una que no existe, cada push queda
como *Preview* y el dominio corto no sirve nada: da el 404 de plataforma de
Vercel, el que dice `NOT_FOUND` con un identificador de región.

El resto ya está declarado en el repo para que Vercel no lo adivine:
`vercel.json` fija el preset de Next —que suele quedar en «Other» cuando el
proyecto se creó apuntando a un repositorio todavía vacío— y `engines.node` la
versión.

Si nada de eso es, el error está en el **Build Log** del deployment, en la
primera línea roja. Es lo único que dice qué pasó.

---

## Qué falta, y en qué orden

El plan completo está en [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md).
Lo próximo, por dependencia:

1. **Integración con GoHighLevel.** Hoy el lead se carga a mano y eso funciona,
   pero es el trabajo que más se repite. Hace falta un webhook de ejemplo para
   saber contra qué mapear.
2. **Matching lead ↔ closer.** Necesita volumen antes de significar algo: con los
   números de un mes, «Kevin cierra mejor los de e-commerce» son cuatro llamadas.
3. **Comisiones**, incluida la de repesca — el dato de quién reflotó cada lead ya
   se guarda.
4. **Casos de éxito**, para que el toque 3 de la cadencia tenga qué mandar.

### Para que el analizador funcione

Hace falta `ANTHROPIC_API_KEY` en el entorno. Sin ella, el resto de la
aplicación anda igual y el analizador lo dice en pantalla en vez de fallar con un
error genérico. El gasto de cada llamada al modelo queda anotado en
`llamadas_modelo`, con sus tokens y su costo: un sistema que llama a un modelo
por cada llamada de ventas se vuelve caro sin que nadie se entere.
