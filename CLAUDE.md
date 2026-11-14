# App de finanzas personales: instrucciones y especificación para Claude Code

Versión del 13 de noviembre de 2026.

**Primera tarea:** guarda este documento completo como `CLAUDE.md` en la raíz del repositorio. Después, crea la estructura del proyecto y empieza por la fase 1. No avances a la siguiente fase sin mi validación.

# Parte 1. Instrucciones

## Qué es

App web privada de finanzas personales para un único usuario. Sustituye a Fintonic: importa los extractos de BBVA en Excel, categoriza los movimientos, excluye los gastos de empleado y muestra un extracto mensual con el gasto real. Se usa solo en el iPhone.

**Alcance actual (decisión del usuario del 13/11/2026):** solo la app del iPhone, con los datos guardados en el propio móvil. Quedan para más adelante el escritorio, la conexión con Google y cualquier sincronización o base de datos externa. No se construye nada de eso hasta nueva indicación. Donde la especificación de la segunda parte habla de escritorio, aplica solo cuando se retome.

La especificación funcional completa está en la segunda parte de este documento. Léela entera antes de empezar cualquier fase.

## Stack

- Frontal: React, TypeScript y Vite. PWA instalable en el iPhone, diseñada solo para móvil (en un navegador de ordenador se ve como una columna de móvil).
- Estilos: Tailwind CSS. Tema claro y oscuro: según el sistema o elegido en Ajustes (atributo `data-theme`).
- Lectura de Excel: SheetJS, siempre en el navegador.
- Datos: solo en el iPhone (IndexedDB), sin backend ni base de datos externa (decisión del usuario del 13/11/2026). Exportar un archivo JSON es la copia fuera del móvil; importarlo lo recupera todo exactamente igual (por ejemplo, en un iPhone nuevo). Supabase queda en pausa (`supabase/README.md`).
- Gráficos: Recharts.
- Despliegue: GitHub Pages en `https://cullera33-puchi.github.io/PuchiFin/`, publicado por `.github/workflows/publicar.yml` en cada envío a `main` (tests, build con la ruta `/PuchiFin/` y publicación).
- Todos los servicios deben ser gratuitos. No usar la API de Anthropic ni ningún servicio de pago.

## Reglas que no se pueden saltar

1. Ningún número de cuenta, IBAN, número de tarjeta ni DNI se guarda en el dispositivo, en las copias, en los archivos exportados ni en el repositorio. La anonimización se hace antes de guardar nada.
2. Los ficheros originales de BBVA nunca se guardan: se leen, se anonimizan y se descartan. Tampoco van al repositorio.
3. Antes de confirmar una importación, verificación final de lo que se va a guardar con patrones de IBAN, tarjeta y DNI. Si encuentra alguno, bloquea la importación y muestra la línea afectada.
4. Los datos no salen del dispositivo salvo por una exportación que pide el usuario (archivo JSON o PDF). Sin servidores, cuentas ni bases de datos externas. Importar un archivo sustituye todo y antes guarda una copia del estado actual.
5. Solo los movimientos de tipo Normal computan en el extracto, el presupuesto y los totales.
6. Importes en euros con signo: negativo es gasto, positivo es ingreso. En pantalla, formato español (1.234,56 €).
7. Interfaz en español.

## Datos de prueba

- Los Excel reales de BBVA se dejan en `datos_locales/`, que va en `.gitignore`. Nunca se suben al repositorio.
- Para los tests, crear ficheros sintéticos en `tests/fixtures/` con las mismas columnas y datos inventados.

## Alcance de esta primera versión

Fases 1 a 3 de la hoja de ruta. La fase 4 se construye en la v0.23.0 a petición del usuario (14/11/2026); las fases 5 y 6 quedan fuera hasta nueva indicación. El modelo de datos se crea completo desde la fase 1.

### Fase 1. Base

- Almacenamiento en el dispositivo con el modelo de datos completo, incluidos compromisos y eventos previstos (`src/lib/tipos.ts`), y exportación e importación en un archivo JSON.
- Sin acceso con cuenta: la app solo guarda datos en el dispositivo (cambio del 13/11/2026; antes, acceso con Google y Supabase).
- Alta de cuentas por alias, sin números: Cuenta principal, Cuenta 2, Tarjeta e Hipoteca.
- Catálogo predeterminado de categorías cargado como datos iniciales.
- Se cierra cuando el almacenamiento, el modelo, la exportación e importación y el catálogo están operativos.

### Fase 2. Importación BBVA

- Lector de Excel de cuenta y de tarjeta. El mapeo de columnas va en un fichero de configuración por origen, no en el código.
- Anonimización, normalización, deduplicación (sin fecha de inicio desde la v0.14.0: entra todo lo que traen los Excel), reglas de categorización, traspasos internos y pantalla de revisión.
- Opción de deshacer una importación completa.
- Se cierra cuando octubre y noviembre están importados sin duplicados, sin datos identificativos y sin doble cómputo de la tarjeta.

### Fase 3. Extracto y gastos de empleado

- Extracto mensual, lista de movimientos con búsqueda y filtros, corrección de categorías individual y en bloque.
- Marcado rápido de lo que no cuenta: deslizar sobre el movimiento y selección múltiple (un gasto queda como gasto de empleado y un ingreso como reembolso). Sin conciliación ni vista de empleado (retiradas en la v0.15.0 a petición del usuario).
- Exportación a Excel de cualquier vista.
- Se cierra cuando octubre y noviembre están cerrados.

### Herramientas comunes (traídas de PuchiTask, v0.2.0)

Se mantienen en todas las fases. Están en Ajustes, Herramientas.

- **Versiones y novedades.** Cada versión publicada sube `version` en `package.json`, añade su entrada técnica a `CHANGELOG.md` y de 3 a 5 líneas para el usuario en `public/novedades.json` (la más reciente arriba, campos `version`, `fecha` y `cambios`). Sin ese cambio, los dispositivos no ven las novedades. Al detectar una versión nueva, la app avisa «Nueva versión disponible» y «Actualizar» muestra las novedades que faltan antes de aplicarla.
- **Registro.** `registrar()` de `src/lib/registro.ts` anota errores y eventos en el dispositivo (400 entradas) para copiarlo al chat. Toda operación nueva relevante (importación, copia, restauración, exportación, PDF, errores al guardar) se registra. Nunca conceptos, importes ni nombres: solo recuentos e identificadores internos. Si se cuela un IBAN, tarjeta o DNI, se enmascara.
- **Copias de seguridad y archivo.** Copia diaria en el dispositivo (IndexedDB, 7 últimas), copia manual, exportar a archivo JSON e importar o restaurar, que sustituye todo y antes guarda una copia del estado actual. Si cambia el modelo de datos, subir `VERSION_ESQUEMA` en `src/lib/tipos.ts` y añadir la adaptación en `migrar()` de `src/datos/archivo.ts`, para que los archivos antiguos se sigan importando.
- **Datos de prueba.** Movimientos inventados del mes en curso y los dos anteriores, colgados de importaciones con origen `datos_prueba`: se eliminan de una vez sin tocar lo real. Viajan en el archivo exportado como el resto de datos. El extracto, los resúmenes y el PDF avisan cuando hay datos de prueba. Si se añaden reglas o tipos nuevos, el generador debe cubrirlos.
- **Estilo iOS (v0.3.0).** Barra de pestañas flotante de cristal (v0.16.0). Iconos de trazo fino; los de categorías y cuentas, en baldosas de color (`Baldosa`) con el catálogo de `src/componentes/iconos.ts`. Nada de emojis como iconos. Paleta del sistema de iOS, interruptores en lugar de casillas, controles segmentados, listas agrupadas con chevrón y botones de texto o de icono sin marco. Toda pantalla nueva sigue este estilo.
- **Pruebas en GitHub.** `.github/workflows/pruebas.yml` ejecuta los tests y el build en cada envío.

### Resúmenes en PDF (adelantado a petición del usuario, v0.2.0)

Resumen semanal y mensual, con vista previa en pantalla y PDF para compartir (por ejemplo, con alguien de la familia que no tiene acceso a la app). Especificación en el apartado 8 bis de la segunda parte. El contenido se ajusta con el uso.

## Cómo trabajar

- Todo cambio de datos pasa por una función pura de `src/datos/operaciones.ts`, aplicada con `cambiar()` o `intentar()`. Ahí van las comprobaciones (datos identificativos, unicidad, integridad), con sus tests.

- Una fase cada vez. Al terminar cada fase, resume qué se ha hecho, qué queda pendiente y cómo probarlo.
- Tests unitarios para el lector de Excel, la anonimización, la deduplicación y las reglas de categorización. Es donde un error no se ve en pantalla. Las pruebas de navegador (`npm run build` y después `npm run e2e`) recorren la app en un iPhone simulado; toda pantalla o gesto nuevo importante se añade a `tests/e2e/app.e2e.ts`. `src/importacion/importar.test.ts` importa los Excel de prueba de punta a punta: cualquier cambio del importador debe mantenerlo en verde.
- Gestos: toda lista de movimientos usa `FilaMovimientoDeslizable` (el gesto sobre una fila no lo toma la vuelta desde el borde); toda pantalla secundaria, `BarraNavegacion` (vuelve también deslizando a la derecha, desde el borde o desde cualquier punto sin gesto propio); las hojas se cierran arrastrando. Entre pestañas solo con la barra y el mes, con la tira: sin gestos laterales en las pantallas principales salvo las filas (decisión del usuario, v0.26.0).
- Usabilidad: `docs/guia-usabilidad-iphone.md` es la guía de comportamiento y aspecto (aportada por el usuario, v0.7.0). Se aplica salvo donde choca con esta especificación: el stack sigue siendo React con Vite, los nombres del código siguen en español y los menús de pulsación larga quedan pendientes. En la práctica: hojas con `Hoja` (portal, guardia de 450 ms) y confirmaciones con `confirmar()`; cambios de datos que el usuario hace a mano con `useHacer()` (aviso con «Deshacer»); barras flotantes con `Flotante`; cabeceras de grupo con la clase `cabecera-grupo`; recuentos con `plural()`; gestos con `crearVelocidad` y `esLanzamiento`.
- Datos del usuario entre versiones: nada de lo categorizado, tipificado o conciliado cambia al publicar una versión. Las mejoras de categorización llegan solo a lo pendiente (`esPendiente`) mediante `actualizarLogica`. Si cambia el modelo, subir `VERSION_ESQUEMA`, añadir el paso en `migrar()` y mantener en verde `src/datos/versiones.test.ts`.
- Cuadre con el banco: toda importación de cuenta debe dejar `cuadrarCuenta` en verde, y la liquidación de la tarjeta, `cuadrarLiquidaciones`. La deduplicación empareja primero por saldo del banco y después por concepto; `src/importacion/importar.test.ts` lo cubre.
- Si una decisión no está en la especificación, pregunta antes de asumir.
- Mantén actualizado el apartado de estado de este fichero.

## Pendiente de confirmar

- Formato del Excel de la tarjeta de crédito: el resumen de un año (13/11/2026) muestra que la columna Movimiento trae la categoría de BBVA y que el pago llega como «Rebut mes anterior»; falta confirmar columnas y signo con un Excel. El de cuenta está confirmado con un Excel real del 13/11/2026 («Informe BBVA»: Fecha valor, Fecha, Concepto, Movimiento, Importe, Divisa, Disponible, Divisa, Observaciones). Para la tarjeta se supone el mismo sin Disponible; falta un Excel real (columnas y signo de las compras).
- Bizum: la columna Movimiento trae el mensaje («Recibido: …», «ENVIADO: …», «COMPRA: …»), que se conserva aplicando los alias. Confirmar si en algún caso trae el nombre de la persona y debe quitarse.
- Entidad de cada cuenta y cuenta desde la que se paga la hipoteca.
- El repositorio es público. No contiene datos personales. El usuario lo deja pendiente. Ojo: GitHub Pages en un repositorio privado exige un plan de pago de GitHub; si se hace privado, habría que publicar en otro servicio gratuito (por ejemplo, Vercel).

## Hoja de ruta de mejoras (revisada en la v0.20.0)

Ordenada por esfuerzo, de menos a más, con prioridad para la usabilidad y el reporting. Esfuerzo: bajo (una sesión), medio (dos o tres), alto (varias y con decisiones). Lo hecho de la hoja anterior (v0.9 a v0.20) está en el apartado Estado. Cada versión se valida con datos reales antes de pasar a la siguiente.

| Orden | Mejora | Tipo | Esfuerzo |
| --- | --- | --- | --- |
| 1 (hecha, v0.21.0) | Resumen del mes en una frase arriba del Extracto: lo gastado hasta hoy frente a la media y la categoría que más se desvía | Reporting | Bajo |
| 2 (hecha, v0.21.0) | Comparativa con el mismo mes del año anterior en el Extracto y en Informes, además de la media | Reporting | Bajo |
| 3 (hecha, v0.21.0) | Ranking de comercios en Informes: dónde más se gasta y con qué frecuencia, por mes y por año | Reporting | Bajo |
| 4 (hecha, v0.21.0) | Gastos hormiga: compras pequeñas y frecuentes por comercio, total del mes y proyección anual | Reporting | Bajo |
| 5 (hecha, v0.21.0) | Filtro rápido por cuenta en Movimientos (chips por cuenta) y búsqueda con «Cancelar» | Usabilidad | Bajo |
| 6 (hecha, v0.21.0) | Cierre de mes guiado: importar las tres fuentes, cuadre en verde, sin categoría a cero y PayPal repartido | Usabilidad | Bajo |
| 7 (hecha, v0.21.0) | Evolución del capital en Informes: posición a final de cada mes y ahorro real frente al del extracto | Reporting | Bajo |
| 8 (hecha, v0.22.0) | Gastos fijos y recurrentes: detección por comercio, periodicidad e importe; próximos cargos y subidas de precio | Reporting | Medio |
| 9 (hecha, v0.22.0) | Previsión de cierre de mes según el ritmo de gasto y los recurrentes que faltan | Reporting | Medio |
| 10 (hecha, v0.22.0) | Presupuesto por categoría con barra de consumo en el Extracto (parte de la fase 4) | Reporting | Medio |
| 11 (hecha, v0.22.0) | Menú de pulsación larga en las filas: categoría, no cuenta, nota y ver parecidos (guía 7) | Usabilidad | Medio |
| 12 (hecha, v0.22.0) | La hoja sube con el teclado al escribir (guía 6.4) | Usabilidad | Medio |
| 13 (hecha, v0.22.0) | Avisos de recurrentes: cargo nuevo, subida de importe o cargo esperado que no llega | Reporting | Medio |
| 14 (hecha, v0.22.0) | Optimizar con Claude: prompt preparado con fijos, recurrentes y hormiga, por enlace o archivo. Sin API ni coste | Reporting | Medio |
| 15 (hecha, v0.22.0) | Pruebas de navegador (Playwright) en GitHub antes de publicar, con archivos de cada esquema anterior | Técnica | Medio |
| 16 (hecha, v0.22.0; el cambio de pestaña deslizando se retiró en la v0.26.0 a petición del usuario) | Cambiar de pestaña deslizando y recolocación animada de las listas (guía 4.1 y 5) | Usabilidad | Medio |
| 17 (hecha, v0.23.0) | Fase 4: plan de pagos de la deuda familiar con simulación, gastos previstos, presupuesto con meses especiales, vista anual y avisos, y «Analizar con Claude» en el resto de vistas (definido el 14/11/2026, apartado 10) | Reporting | Alto |
| 18 | Fase 5: estacionalidad y gastos atípicos | Reporting | Alto |
| 19 | Fase 6: Face ID e importación de PDF. Las notificaciones exigen un servidor de envío, fuera del alcance sin coste | Usabilidad | Alto |
| Decisión | Repositorio privado (exige otro alojamiento gratuito) | Técnica | Pendiente del usuario |

## Estado

- Fase 0: diseño funcional cerrado. Faltan los Excel reales de BBVA para fijar el mapeo de columnas.
- Fase 1 (13/11/2026): primera versión construida, pendiente de validación.
  - Proyecto React, TypeScript y Vite con Tailwind, PWA instalable y navegación móvil (barra inferior) y escritorio (menú lateral).
  - Migraciones en `supabase/migrations/`: las nueve tablas más `ajustes`, RLS en todas, lista de correos autorizados que bloquea el alta de cualquier otra cuenta, comprobación en base de datos de IBAN, tarjeta y DNI en los textos, y función de carga inicial del catálogo de categorías, ajustes y compromiso de deuda.
  - Pantallas: acceso con Google, alta y edición de cuentas por alias, catálogo de categorías editable y ajustes generales. Extracto, Movimientos y Empleado quedan como marcadores de las fases 2 y 3.
  - Tests: detección de datos identificativos, formato de importes y validación de alias.
  - Supabase, el acceso con Google y el correo autorizado quedaron sin activar y se descartaron en la v0.4.0.
- v0.2.0 (13/11/2026): herramientas de PuchiTask (versiones y novedades, registro, copias de seguridad y datos de prueba) y resúmenes semanal y mensual en PDF. Detalle en `CHANGELOG.md`. Pendiente de validar por el usuario, igual que la fase 1.
- v0.33.0 (14/11/2026): usabilidad y visual del análisis: modo discreto en toda la app (`src/lib/discreto.ts`; lo exportado sale con cifras reales), Herramientas por apartados (`/ajustes/herramientas/:apartado`), PDF del mes al completar el cierre (`compartirResumenMes`) e Informes en tres vistas (Categorías, Comercios y Evolución). Quedan del análisis: P2 (resto de cálculos compartidos) y el reporting R2 a R6.
- v0.32.0 (14/11/2026): primer lote del análisis de la app: Movimientos más ligero, con memoria al cambiar de pestaña y carga por tramos de 40; nombres de categoría sin repetir; Informes con el estilo y los colores del Extracto; importes redondos en los totales; «Te quedan X € hasta fin de mes»; búsqueda diferida y cálculos guardados por versión de los datos (`src/lib/cache.ts`). Lo pendiente del análisis, en la entrada de la v0.33.0.
- v0.31.0 (14/11/2026): Extracto rediseñado a propuesta aprobada por el usuario: capital y deuda en dos filas (`FilasPatrimonio`, detalle en `/extracto/posicion`), tarjeta principal del mes (`TarjetaMes`, con «Cómo se calcula»), avisos agrupados en «Cosas pendientes», seis categorías con «Ver todas» y diferencias solo relevantes, y acciones en el menú «…».
- v0.30.0 (14/11/2026): sin zoom por doble toque en toda la app (`touch-action: manipulation`), que se comía los toques seguidos en el iPhone; los comercios de Informes abren una hoja con sus movimientos en lugar de saltar a Movimientos.
- v0.29.0 (14/11/2026): volver deslizando más fluido: el gesto mueve la capa de la pantalla directamente, una vez por fotograma y sin redibujar la app; sombra en una franja aparte.
- v0.28.0 (14/11/2026): plan de pagos más rápido (estadísticas y capital calculados una vez por versión de los datos, simulación diferida), una sola simulación compartida entre Ingresos previstos y el plan (`useSimulacion`), tarjeta de la deuda debajo de «Tu posición» y en Informes, y apartado del plan en el PDF de los resúmenes con el escenario actual y el de las nóminas que no cuentan.
- v0.27.0 (14/11/2026): la deuda pendiente y el colchón se pueden cambiar en la simulación del plan de pagos (`Simulacion.deuda` y `colchon`) y guardar en el plan si convencen.
- v0.26.0 (14/11/2026): decisiones del usuario sobre la navegación. Entre pestañas solo con la barra (fuera `useCambioDePestana`) y sin cambio de mes deslizando en el Extracto e Informes: el mes se elige en la tira, que enseña siempre cinco meses enteros. Ajustes pasa a una lista agrupada al estilo del iPhone (`PaginaAjuste`, «‹ Ajustes»); las pantallas del Extracto abiertas desde Ajustes vuelven a Ajustes (`state.atras`).
- v0.25.0 (14/11/2026): bonus anual en cada nómina, aparte de las pagas extra (esquema 12, `bonus`): mes e importe neto, cuenta en la previsión y se puede quitar en la simulación (`Simulacion.bonus`).
- v0.24.0 (14/11/2026): previsión de ingresos pedida por el usuario. Nóminas netas con pagas extra y fechas (esquema 11, `ajustes.nominas`, `guardarNomina`); con una incluida, sustituyen al historial de nómina en la previsión. Una nómina no incluida sirve para simular (por ejemplo, la de la pareja): efecto en el ahorro, el capital dentro de un año, el pago de julio y el año de liquidación. Pantalla `/extracto/ingresos` y gráfico de capital previsto en el plan de pagos (`serie`, `GraficoCapital`). Pendiente de validar con datos reales.
- v0.23.0 (14/11/2026): fase 4 (puntos 1 a 6 confirmados por el usuario). Pendiente de validar con datos reales.
  - Presupuesto: aviso al importar si una categoría pasa del 80 % o del 100 %, meses especiales con otro importe (`guardarExcepcionPresupuesto`) y resumen del año (`presupuestoAnual`).
  - Gastos previstos (`/extracto/previstos`, `src/lib/previstos.ts`): pendientes, ya cargados o no vistos; entran en la previsión de cierre y en el plan de pagos.
  - Plan de pagos (`/extracto/plan`, `src/lib/plan.ts`): esquema 10 con el colchón sobre la Cuenta 2 (`cuenta_colchon_id`), `guardarCompromiso`, proyección mes a mes, pago cada julio, calendario, simulación, pagos reales y efecto del mes cerrado; tarjeta en el Extracto.
  - Analizar con Claude (`src/lib/analizar.ts`, `HojaClaude`) en el Extracto, Informes, Presupuesto y Plan de pagos.
- v0.22.0 (14/11/2026): las mejoras 8 a 16 de la hoja de ruta, revisión de código y optimización.
  - Gastos fijos y recurrentes (`src/lib/recurrentes.ts`, pantalla `/informes/fijos`): detección por comercio (PayPal, por importe), periodicidad e importe; fijo frente a variable, próximos cargos, subidas y bajas. Avisos: subida de precio, cargo que no llega (con la fecha de los datos de cada cuenta, no la de hoy) y cargo nuevo que se repite.
  - Previsión de cierre del mes en curso (`src/lib/prevision.ts`): gastado, recibos que faltan y variable al ritmo de los meses anteriores.
  - Presupuesto por categoría (`guardarPresupuesto`, `src/lib/presupuesto.ts`, pantalla `/extracto/presupuesto`): medias de 3 meses como propuesta, barras en el Extracto con estado y proyección. Sin cambio de esquema (la colección `presupuestos` ya existía).
  - Optimizar con Claude (`src/lib/optimizar.ts`): texto con fijos y gastos hormiga, que se ve antes de enviarlo; copiar, compartir o abrir claude.ai.
  - Menú al mantener pulsada una fila (`onPulsacionLarga` en `FilaDeslizable`), la hoja sube con el teclado (`--kb`, respaldo arriba) y cambiar de pestaña deslizando en las pantallas principales (`useCambioDePestana`).
  - Pruebas de navegador (`playwright.config.ts`, `tests/e2e`, `npm run e2e`) en los dos flujos de GitHub antes de publicar, con archivos de los esquemas 3, 5, 7 y 8 (`tests/fixtures/archivos`, `npm run archivos:prueba`).
  - Optimización: reglas ordenadas y patrones normalizados en caché (`clasificar`), agrupaciones sin copiar listas (`anadirA`), y el lector de Excel fuera del arranque (paquete principal de 928 a 423 KB).
  - Revisión de código independiente con 12 hallazgos, todos corregidos (detalle en `CHANGELOG.md`). Lo más relevante: los cálculos «a estas alturas del mes» usan la fecha del último dato importado (`fechaDeLosDatos`) y el primer mes importado no entra en las medias (`primerMes`).
- v0.21.0 (13/11/2026): las siete mejoras de esfuerzo bajo de la hoja de ruta: el mes en una frase, comparativa con el mismo mes del año anterior, ranking de comercios, gastos hormiga, chips por cuenta y «Cancelar» en Movimientos, cierre de mes guiado y capital mes a mes con el ahorro real.
- v0.20.0 (13/11/2026): reclasificar en bloque revisando la lista: al cambiar la categoría, la hoja muestra cada movimiento parecido con su casilla (pendientes y PayPal marcados; lo elegido a mano, sin marcar) y, en PayPal, todos los demás cargos de PayPal. Hoja de ruta revisada, por esfuerzo.
- v0.19.1 (13/11/2026): con una hoja abierta, la pantalla de detrás ya no se desplaza (bloqueo del gesto fuera de las zonas desplazables de la hoja y en sus extremos).
- v0.19.0 (13/11/2026): «Tu posición» arriba del Extracto: capital (cuentas según el banco menos lo pendiente de la tarjeta), saldo por cuenta, variación del mes, evolución y ojo para ocultar las cifras (`calcularPosicion`, `pendienteTarjeta`).
- v0.18.0 (13/11/2026): tira de periodos con botones grandes en el Extracto e Informes (`TiraPeriodos`); aviso de 5 días sin importar por cuenta (`avisoImportacion`); registro saneado (sin comercios, importes ni categorías), con repeticiones agrupadas y «Borrar» a la vista.
- v0.17.0 (13/11/2026): crear una categoría al momento desde el selector de categoría, con aviso de las parecidas que ya existen (`categoriasParecidas`: igual, parecida o sinónimo) y «Usar esta»; la igual en el mismo nivel no se duplica. También en Ajustes, Categorías.
- v0.16.1 (13/11/2026): volver deslizando desde cualquier punto de una pantalla apilada (salvo filas, cambio de mes, campos y chips); sin cambio de mes por gesto dentro de una categoría de Informes; la subcategoría elegida es un paso de «atrás».
- v0.16.0 (13/11/2026): barra de pestañas flotante de cristal (toque en toda la pestaña, la activa resaltada, tocarla sube al principio). PayPal se reparte por importe: pantalla Repartir PayPal, aprendizaje y reglas por importe exacto (`esPasarela`, `claveConImporte`); la regla de la app «PayPal» se retira.
- v0.15.2 (13/11/2026): barra de pestañas a cuatro columnas, sin hueco a la derecha.
- v0.15.1 (13/11/2026): deslizar una fila ya no cambia de mes ni vuelve atrás (el gesto que empieza en una fila es solo de la fila; volver, desde el mismo borde). En Informes, dentro de una categoría, las subcategorías filtran los movimientos.
- v0.15.0 (13/11/2026): fuera la gestión de gastos de empleado (decisión del usuario: no la usa). Sin pestaña Empleado, sin propuestas automáticas, sin conciliación ni pendiente de reembolso. Queda el marcado rápido: deslizar hacia la derecha, «No cuenta» (gasto a gasto de empleado, ingreso a reembolso) o «Cuenta»; la categoría pasa a deslizar hacia la izquierda. Reglas de la app retiradas con `REGLAS_RETIRADAS`. Sin cambio de esquema.
- v0.14.1 (13/11/2026): el cuadre de la tarjeta cuenta los abonos de compras fraccionadas o financiadas y excluye solo el pago de la liquidación; «Dar por buena» una liquidación que no cuadra (esquema 9, `cuadre_confirmado`).
- v0.14.0 (13/11/2026): sin fecha de inicio ni corte con Fintonic (decisión del usuario): entra todo lo que traen los Excel. Esquema 8 (se quitan `fecha_inicio` y `fecha_corte_fintonic` de los ajustes). El cuadre de la tarjeta toma como referencia la primera compra importada; los datos y Excel de prueba cubren el mes en curso y los dos anteriores.
- v0.13.0 (13/11/2026): respuestas del usuario a la revisión del año. Esquema 7 (`actualizarCatalogo`, mismos identificadores): Transporte > Taxi y VTC (los taxis siguen proponiéndose como posible gasto de empleado), IBI y tasas pasa de Vivienda a Impuestos, y categorías nuevas Cuidado personal, Mascotas, Formación y Efectivo, con sus reglas. Fraccionamiento de gastos como traspaso; PayPal a Compras > Hogar por defecto.
- v0.12.0 (13/11/2026): lo aprendido del resumen de un año de movimientos reales (solo cadenas públicas y palabras genéricas en el código; las reglas personales viven en el dispositivo). Etiqueta de categoría de BBVA fuera del nombre del comercio, liquidación de la tarjeta como la llama BBVA, operaciones financiadas, diccionario ampliado y prioridades, y reglas importadas por palabra clave y de tipo.
- v0.11.2 (13/11/2026): las copias muestran también el número de reglas y la copia manual ofrece guardar en Archivos; test de copia y restauración completa.
- v0.11.1 (13/11/2026): «Empezar de cero» en Herramientas para una carga limpia (`empezarDeCero`): borra lo cargado y conserva cuentas, categorías, ajustes y reglas, con copia previa y Deshacer.
- v0.11.0 (13/11/2026): hoja de movimiento, interruptores Liquid Glass y categorizar con Claude. Pendiente de validar por el usuario.
  - `Hoja` admite `listo` (botón de texto a la derecha de la cabecera, como «Listo» en iOS) y se cierra arrastrando hacia abajo desde el contenido cuando está arriba del todo. `DetalleMovimiento` rediseñado: baldosa e importe grandes, filas agrupadas (Categoría, Tipo como lista con marca y descripción, Cuenta en el mes siguiente), nota que se guarda sola con «Guardando… / Guardada» y cada cambio con Deshacer. `useElegirCategoria`: sin parecidos, la categoría se aplica directamente con su regla, sin hoja intermedia (también al deslizar).
  - `Interruptor` al estilo Liquid Glass: carril de 64 por 28, botón en cápsula y lente de cristal al pulsar, con zona táctil de 44.
  - Categorizar con Claude (Ajustes, Herramientas; `src/importacion/claude.ts`): resumen de comercios anonimizado de cualquier periodo, sin fechas, saldos, cuentas ni nombres, que no se guarda; se ve antes de copiarlo o compartirlo. Importar reglas pegadas («clave, tabulador, Categoría > Subcategoría») con vista previa, errores por línea, aplicación opcional a lo pendiente y Deshacer. Las reglas son manuales y solo viven en el dispositivo; nada va al código.
- v0.10.0 (13/11/2026): categorización eficiente. Pendiente de validar por el usuario.
  - Catálogo: «Restaurantes y ocio» se separa en Restaurantes (Restaurantes, Cafeterías, Comida rápida y a domicilio, Bares y copas) y Ocio (Planes y salidas, Cine y espectáculos, Cultura, Deporte, Juegos); Suscripciones con una subcategoría por plataforma (`PLATAFORMAS`) más Otras plataformas, Software y Cuotas. Esquema 6: `actualizarCatalogo` adapta los datos anteriores sin cambiar identificadores (nada pierde su categoría).
  - Diccionario de la app (`REGLAS_BASE`) ampliado a 63 reglas con unos 650 comercios y palabras clave españolas y catalanas; las plataformas mandan sobre las reglas generales; las reglas existentes conservan su nombre para que se actualicen en el dispositivo. Test con conceptos típicos (`src/importacion/diccionario.test.ts`). Expresiones compiladas en caché.
  - Mejoras para lo ya categorizado (`propuestasRecategorizacion`): lo que categorizó una regla y que las reglas de ahora, o una corrección manual posterior en el mismo comercio, llevarían a otra categoría. Se propone por grupos en Categorizar con «Sí» o «No, dejarlo así» (`fijarCategoria`, que lo deja como decisión del usuario); aviso en el Extracto y en Movimientos. Lo manual nunca se propone.
  - Scroll: las filas y el contenedor deslizable ya no llevan transform en reposo y las cabeceras fijas van en su propia capa (artefactos en iOS).
- v0.9.0 (13/11/2026): categorización rápida de lo pendiente, pensada para la primera carga. Pendiente de validar por el usuario.
  - Pantalla Categorizar (`/movimientos/categorizar`, `src/datos/categorizar.ts`): pendientes agrupados por comercio y signo, de más a menos movimientos; sugerencia por parecido con lo ya categorizado (mismo comercio, misma primera palabra o palabras en común) o por las reglas de la app; «Sí», «Otra», «Saltar» y chips con las categorías más usadas y las últimas elegidas; casillas para quitar movimientos de un grupo; «Aceptar sugerencias claras» en bloque con confirmación; reglas para las próximas importaciones; todo con Deshacer.
  - Hoja de corrección: además del elegido, los similares pendientes (mismo comercio y comercios que empiezan igual) activados; los ya categorizados de otra forma, desactivados.
  - Accesos: Extracto (sin categoría), Movimientos y el final de cada importación.
- v0.8.1 (13/11/2026): corregidos los artefactos al hacer scroll rápido en Movimientos (cabeceras de día y barra de filtros fijas en el mismo sitio; desenfoque en cabeceras fijas; franja bajo la barra de estado).
- v0.8.0 (13/11/2026): datos protegidos entre versiones, tarjeta por periodo de liquidación y hoja de ruta. Pendiente de validar por el usuario.
  - Lo ya categorizado no se toca nunca. Una vez por versión (`actualizarLogica` en `src/importacion/pendientes.ts`, al arrancar y con copia previa) las reglas de la app se ponen al día y se aplican solo a lo pendiente; también a mano con «Aplicar reglas a lo pendiente» en Movimientos. Los traspasos ya no se emparejan con lo categorizado a mano y deshacer una importación devuelve también la categoría. Prueba de compatibilidad con un archivo de la v0.6.0 (`src/datos/versiones.test.ts`). Esquema 5 (`version_logica`).
  - Liquidación de la tarjeta (`src/lib/tarjeta.ts`): cada cargo en la cuenta se cuadra con el tramo de compras de la tarjeta que suma lo mismo, sin suponer el mes natural; aviso al importar la cuenta o la tarjeta, estado en Ajustes, Cuentas, y en el Extracto. Regla para el abono de la liquidación si el Excel de la tarjeta lo trae.
  - Al pegar, la cuenta se propone por los saldos: una cuenta con saldos en esas fechas que no encajan se descarta (la primera vez que se pega la Cuenta 2 no va a la principal).
- v0.7.0 (13/11/2026): informes, cuadre con el banco, privacidad y guía de usabilidad. Pendiente de validar por el usuario.
  - Privacidad: sin nombre del usuario ni importes personales en el repositorio; la deuda familiar y el colchón empiezan a 0 y se introducen en la app. Siguen en el historial de git y en las descripciones de los PR anteriores (decisión pendiente del usuario).
  - Deduplicación por saldo del banco y por concepto, filas repetidas en el fichero, cuenta reconocida por los saldos y lista de «Ya importados» en la revisión.
  - Cuadre de saldo por cuenta (`src/lib/saldos.ts`): repetidos y huecos, en la revisión, tras importar, en Ajustes, Cuentas (quitar repetidos y comprobar el saldo que se ve en BBVA) y como aviso en el Extracto. Esquema 4 (`saldo_confirmado`).
  - Pestaña Informes: gastos o ingresos por mes o año, quesito por categoría, subcategorías y movimientos, comparativa y barras.
  - Guía de usabilidad aplicada (ver «Cómo trabajar»).
- v0.6.0 (13/11/2026): ajustes con el Excel real y peticiones del usuario.
  - Lector con el formato real «Informe BBVA» (cabecera en la fila 5, concepto de ancho fijo con comercio, población y país, columna Movimiento con el tipo, un detalle o el nombre del titular u ordenante, fecha de la compra en los cargos del lunes). El Excel real del usuario nunca se guarda en el repositorio: los tests usan filas inventadas con la misma estructura.
  - Categorías aprendidas por comercio (`claveComercio`: sin números de tienda, población ni formas jurídicas) en cualquier cuenta, con propuesta por la primera palabra si no hay duda; corrección «mismo comercio» y reglas por comercio. Más comercios y palabras en catalán en las reglas de la app.
  - Gastos de empleado: puntuación en `src/importacion/empleado.ts` (cafeterías, restaurantes, taxis y viajes; tarjeta de crédito; laborable; fuera de la zona de casa, deducida de las poblaciones habituales si no se configura; día de viaje; historial del comercio al 70 %). En la importación, las seguras (0,75 o más) vienen aceptadas y las dudosas no; lo dudoso no aceptado queda en «Posibles gastos de empleado» (Empleado), con revisión rápida deslizando y «Marcar los muy probables». Lo revisado como personal enseña al comercio (`revisado_empleado`). El nombre de la empresa se pide en Empleado y se guarda como alias Empresa (no va en el código).
  - Traspasos: regla de la app para los «Traspaso a/de cuenta» de BBVA (traspaso interno, se netean entre las dos cuentas) y emparejamiento con la otra cuenta.
  - Fin de mes: `mes_imputacion` en el movimiento y `fechaEfectiva` en todos los cálculos. La nómina y la hipoteca de los últimos días del mes (5, configurable) cuentan desde el día 1 del mes siguiente; también lo que se haya pasado a mano antes en el mismo comercio. Interruptor en el detalle y bloque en la revisión.
  - Importar pegando: botón «Pegar» (portapapeles) y zona de pegado; acepta el fichero, una tabla HTML o texto tabulado.
  - Esquema 3 con migración.
- v0.5.0 (13/11/2026): fases 2 y 3 construidas, pendientes de validar con los Excel reales de BBVA.
  - Fase 2: importador en `src/importacion/` (plantillas por origen en `src/importacion/plantillas/*.json`, lectura con SheetJS 0.20.3 desde cdn.sheetjs.com, anonimización, deduplicación con repeticiones, reglas, sugerencias, traspasos entre cuentas propias, comprobación de la liquidación de la tarjeta, verificación final y deshacer). Pantallas Importar e Importaciones. Reglas de la app y sugerencias en `src/importacion/reglas.ts`; esquema 2 del modelo.
  - Fase 3: Extracto mensual con media de hasta 12 meses (mes en curso, con los mismos días), movimientos de una categoría, Movimientos con búsqueda, filtros, bandeja sin categoría, corrección individual y en bloque con regla, Empleado con indicadores y conciliación propuesta, exportación a Excel de cada vista, Análisis (evolución, categoría con media móvil, anual) y Reglas en Ajustes.
  - Gestos con el pulgar (`src/componentes/gestos.tsx`): deslizar filas (izquierda, gasto de empleado; derecha, categoría), deslizar para cambiar de mes o periodo, volver desde el borde izquierdo y cerrar hojas arrastrando.
  - Excel de prueba con formato BBVA (`src/importacion/excelPrueba.ts`, `tests/fixtures/*.xlsx`, `npm run excel:prueba` y botón en Herramientas).
  - Supuestos que hay que confirmar con los Excel reales: columnas de cuenta y de tarjeta, signo de las compras de la tarjeta, cómo vienen los nombres en transferencias y Bizum, y el concepto de la liquidación de la tarjeta.
- v0.4.2 (13/11/2026): publicada en GitHub Pages (`https://cullera33-puchi.github.io/PuchiFin/`). La app admite publicarse en una subcarpeta (variable `BASE_PATH`) y `404.html` hace que funcionen los enlaces directos.
- v0.4.1 (13/11/2026): solo la app del iPhone. Se retira el diseño de escritorio (barra lateral y variantes para pantalla ancha); en un navegador de ordenador se ve la misma columna de móvil. Textos de la app centrados en el iPhone.
- v0.4.0 (13/11/2026): los datos pasan a guardarse solo en el dispositivo (IndexedDB), sin Supabase ni acceso con Google. Exportar e importar un archivo JSON deja otro dispositivo exactamente igual. Las reglas que comprobaba Postgres (datos identificativos, alias únicos, dos niveles de categoría, deduplicación, borrado en cascada) están en `src/datos/operaciones.ts`. Aviso en el Extracto si hay datos reales sin exportar en 14 días. El nombre del familiar (alias Familia) se guardará también en el dispositivo.
- v0.3.0 (13/11/2026): estilo iOS (iconos en baldosas, barra de pestañas flotante, interruptores, listas agrupadas) y PDF reducido para compartir, ambos pedidos por el usuario.

# Parte 2. Especificación funcional

## 1. Objetivo y alcance

App web privada que sustituye a Fintonic. Importa los movimientos de BBVA (dos cuentas y una tarjeta de crédito) de cualquier periodo, los categoriza y muestra un extracto mensual con el gasto real, sin los gastos de empleado. Uso personal, un solo usuario, en móvil y escritorio.

**Dentro de la v1**

- Sin fecha de inicio: entra todo lo que traen los Excel de BBVA, también el histórico (decisión del usuario, v0.14.0).
- Importación periódica de los Excel de BBVA, cuenta y tarjeta por separado.
- Categorías predeterminadas ampliables, categorización automática por reglas y corrección manual.
- Gastos de empleado y reembolsos, que el usuario marca rápido deslizando y no computan.
- Extracto mensual, evolución por categoría, presupuesto mensual por categoría y plan de pagos de la deuda familiar.

**Fuera de la v1**

- Importación de PDF. La carga de Fintonic se descarta: el histórico entra con los Excel de BBVA.
- Conexión directa con el banco (PSD2): exige un agregador de pago y no aporta frente a la carga manual mensual.
- Análisis predictivo, que entra por fases según la hoja de ruta.
- Otras entidades bancarias, aunque el importador queda preparado para añadir formatos.

## 2. Arquitectura, acceso y seguridad

App web responsive que guarda los datos solo en el dispositivo (decisión del 13/11/2026). No hay servidor, cuenta ni base de datos externa: lo guardado está anonimizado y no sale del móvil salvo en una exportación que pide el usuario.

| Capa | Decisión |
| --- | --- |
| Frontal | App web responsive (PWA instalable en el iPhone), una sola base de código para móvil y escritorio. Funciona sin conexión |
| Datos | IndexedDB del dispositivo: un único documento con todas las colecciones del modelo. El procesado de las importaciones se hace en el dispositivo |
| Paso entre dispositivos | Exportar un archivo JSON (hoja de compartir: Archivos, iCloud Drive) e importarlo en el otro dispositivo, que queda exactamente igual |
| Copias | Copia diaria en el dispositivo (7 últimas), copia manual y copia automática antes de importar o restaurar |
| Acceso | Sin cuenta. El iPhone ya está protegido por su código y Face ID; el bloqueo propio de la app queda para la fase de mejoras |
| Ficheros originales | No se guardan. Se leen en el dispositivo, se anonimizan y se descartan |

**Medidas adicionales sin coste**

- El navegador pide almacenamiento persistente. En el iPhone, la app instalada en la pantalla de inicio conserva sus datos; borrar la app o los datos del sitio los elimina, por eso la app recuerda exportar si hay datos reales sin exportar en 14 días.
- Los datos de la app instalada en el iPhone y los de Safari son distintos: se pasan con el archivo.
- Exportación completa a Excel desde la app, como copia propia (fase 3).
- Bloqueo con Face ID al reabrir la app pasados unos minutos (opcional, fase de mejoras).

### Anonimización

El fichero se limpia en el dispositivo antes de guardar nada, y la importación se bloquea si queda algún dato identificativo.

- **Cuentas por alias:** cada cuenta se da de alta con un nombre elegido (Cuenta principal, Cuenta 2, Tarjeta, Hipoteca), sin número de cuenta, IBAN ni número de tarjeta. La app asigna cada fichero a su alias y lo confirma en la revisión.
- **Limpieza de columnas:** las columnas con número de cuenta, IBAN o tarjeta se descartan al leer el fichero.
- **Limpieza de conceptos:** los IBAN y números de tarjeta que aparecen dentro del concepto (transferencias, recibos, compras) se sustituyen por asteriscos, aunque sean parciales.
- **Nombres de terceros:** en transferencias y Bizum, el nombre del ordenante o beneficiario se sustituye por un alias de una lista editable (Empresa para los reembolsos, Familia, Otros). Si no hay alias, se elimina.
- **Verificación final:** antes de confirmar, la app revisa lo que va a guardar con patrones de IBAN, tarjeta y DNI. Si encuentra alguno, no importa y muestra la línea afectada.
- **Exportación a Claude:** parte siempre de los datos ya anonimizados.

## 3. Importación de ficheros

La app solo importa de BBVA (la carga de Fintonic se descarta). Cada origen tiene su plantilla de lectura, y la app reconoce el origen por las cabeceras del fichero sin pedir que se elija.

| Origen | Formato | Uso |
| --- | --- | --- |
| BBVA cuenta | Excel desde bbva.es | Importación periódica (dos cuentas) |
| BBVA tarjeta de crédito | Excel desde bbva.es | Importación periódica |

**Flujo de importación**

1. Subida del fichero desde el móvil o el escritorio (arrastrar o seleccionar).
2. Detección del origen y lectura: limpieza de cabeceras, filas de saldo y totales.
3. Anonimización según el apartado anterior.
4. Normalización: fecha, importe con signo, concepto limpio, saldo tras la operación y cuenta de origen.
5. Deduplicación contra lo ya cargado.
6. Categorización automática por reglas.
7. Pantalla de revisión: nuevos, duplicados descartados y sin categoría. Se confirma o se ajusta en bloque.
8. Verificación final de datos identificativos.
9. Confirmación y registro de la importación (fecha, origen, número de movimientos), con opción de deshacerla completa.

**Deduplicación**

- Clave de cada movimiento: cuenta, fecha de operación, importe y concepto normalizado.
- Si dos movimientos legítimos coinciden en todo (dos cafés iguales el mismo día), se conserva el número de repeticiones del fichero.
- Un fichero que se solapa con otro ya importado solo añade lo que falta.

**Sin fecha de inicio**

- Desde la v0.14.0 no hay fecha de inicio ni corte con Fintonic: entra todo lo que traen los Excel de BBVA. La deduplicación evita repetir lo ya importado.

**Plantillas de lectura**

Las columnas exactas se fijan con los Excel reales de BBVA (cuenta y tarjeta). El mapeo va en un fichero de configuración por origen para poder ajustarlo sin tocar el código.

## 4. Modelo de datos

Nueve colecciones, más los ajustes, en el documento de datos del dispositivo (`BaseDatos` en `src/lib/tipos.ts`). El movimiento es la unidad central y lleva un tipo que decide si computa en el extracto.

| Tabla | Contenido principal |
| --- | --- |
| cuentas | Alias, entidad, tipo (cuenta, tarjeta de crédito o hipoteca), activa. Sin número de cuenta ni de tarjeta |
| importaciones | Origen, fecha, movimientos nuevos y descartados, estado |
| movimientos | Cuenta, fecha de operación, fecha valor, concepto original anonimizado, concepto limpio, importe, saldo tras la operación, categoría, tipo, nota, importación |
| categorias | Categoría y subcategoría, icono, color, si computa como gasto o ingreso, activa |
| reglas | Patrón de concepto, cuenta opcional, rango de importe opcional, categoría o tipo que asigna, prioridad, origen (manual o aprendida) |
| conciliaciones | Vínculo entre un reembolso y los gastos de empleado que cubre |
| presupuestos | Categoría, importe mensual, excepciones por mes |
| compromisos | Deuda pendiente, colchón, ventana de pago, mes de referencia, intereses |
| eventos_previstos | Fecha, concepto, importe, categoría |

Los ajustes generales (lista de alias de terceros, umbrales, días de fin de mes, zona de casa y nóminas previstas) van en `ajustes`, dentro del mismo documento.

Cuentas previstas: dos cuentas bancarias, una tarjeta de crédito y una hipoteca. La hipoteca no tiene movimientos propios: su cuota se carga en una de las cuentas y computa en Vivienda, subcategoría Hipoteca.

**Tipo de movimiento**

| Tipo | Computa en el extracto |
| --- | --- |
| Normal | Sí |
| Gasto de empleado | No |
| Reembolso de empresa | No |
| Traspaso interno (liquidación de tarjeta, movimientos entre cuentas propias) | No |
| Pago de deuda | No, y reduce la deuda pendiente |

El tipo es independiente de la categoría: un hotel de un viaje de trabajo conserva la categoría Viajes pero no computa.

## 5. Categorización y reglas

La app trae un catálogo predeterminado de categorías que se puede ampliar, y las reglas aprenden de cada corrección.

**Punto de partida**

- Catálogo predeterminado de gasto e ingreso (tabla inferior). El histórico entra con los Excel de BBVA y se categoriza con las mismas reglas.
- Se pueden crear categorías y subcategorías nuevas, con icono y color, y renombrar, fusionar o desactivar las existentes. Los movimientos asociados se reasignan.
- También al momento, al elegir la categoría de un movimiento. Antes de crearla, la app avisa de las parecidas que ya existen (sin acentos ni plural, erratas o sinónimos) y no deja duplicar una igual en el mismo nivel.

| Categoría | Subcategorías predeterminadas |
| --- | --- |
| Vivienda | Hipoteca, comunidad, seguro de hogar, mantenimiento y reformas |
| Suministros | Luz, agua, fibra y móvil |
| Alimentación | Supermercado, mercado y tiendas |
| Restaurantes | Restaurantes, cafeterías, comida rápida y a domicilio, bares y copas |
| Ocio | Planes y salidas, cine y espectáculos, cultura, deporte, juegos |
| Transporte | Combustible, peajes, aparcamiento, transporte público, taxi y VTC, mantenimiento del coche |
| Hijos | Colegio, extraescolares, ropa, cuidado |
| Salud | Farmacia, seguro médico, consultas |
| Compras | Ropa, hogar, tecnología, regalos |
| Suscripciones | Una por plataforma (Netflix, Disney+, HBO Max, Amazon Prime, Spotify, Claude, PlayStation, Nintendo), otras plataformas, software, cuotas |
| Viajes | Alojamiento, transporte, actividades |
| Seguros | Coche, vida, otros |
| Comisiones e intereses | Comisiones bancarias, intereses de tarjeta |
| Cuidado personal | Peluquería y estética, perfumería y cosmética, masajes y bienestar |
| Mascotas | Veterinario, comida y accesorios |
| Formación | Estudios, cursos y plataformas |
| Efectivo | Retiradas de cajero |
| Impuestos | IRPF, IBI y tasas (incluye basuras), otros |
| Ingresos | Nómina, otros ingresos |

**Orden de aplicación en cada importación**

1. Reglas manuales, por prioridad.
2. Reglas aprendidas: si un concepto limpio ya se categorizó antes, se repite la categoría.
3. Sin coincidencia: el movimiento queda sin categoría y aparece en la revisión.

**Corrección manual**

- Desde el detalle de un movimiento o en bloque, seleccionando varios.
- Al corregir, la app pregunta si aplicar el cambio a todos los movimientos con el mismo concepto y si crear la regla para los futuros.
- Bandeja de movimientos sin categoría siempre visible con su contador.
- PayPal no dice el comercio: sus cargos se reparten por importe en su propia pantalla (Repartir PayPal), y lo aprendido y las reglas van por importe exacto.
- Al cambiar la categoría, la app lista los movimientos parecidos para revisarlos uno a uno antes de aplicar (casilla por movimiento, «Todos» y «Ninguno»). En PayPal incluye el histórico completo de cargos de PayPal; lo que el usuario categorizó a mano viene sin marcar.

**Más adelante:** sugerencia de categoría para conceptos nuevos por similitud con los ya categorizados, calculada en la propia app y sin coste.

## 6. Gastos de empleado y reembolsos

Los gastos de trabajo y su reembolso quedan fuera del extracto. El usuario los marca a mano; la app no propone nada ni controla lo pendiente de cobrar (decisión del usuario, v0.15.0).

- **Marcado rápido:** en cualquier lista de movimientos, deslizar hacia la derecha y «No cuenta». Un gasto queda como Gasto de empleado y un ingreso como Reembolso de empresa. «Cuenta» lo devuelve a Normal. Los traspasos y pagos de deuda se cambian en el detalle.
- **En bloque:** selección múltiple en Movimientos y el botón «Que no cuenten».
- El movimiento conserva su categoría (Viajes, Restaurantes).
- Sin conciliación de reembolsos, vista de empleado ni sugerencias automáticas. La colección `conciliaciones` se mantiene en el modelo para leer archivos anteriores.

## 7. Tarjeta de crédito y traspasos internos

El gasto se computa en el movimiento de la tarjeta, no en el cargo mensual de la liquidación en la cuenta, que se marca como traspaso interno.

- **Liquidación de la tarjeta:** regla fija sobre el concepto del cargo en cuenta. La app comprueba que el importe cuadra con los movimientos del periodo de la tarjeta y avisa si hay diferencia.
- **Cuotas de pago aplazado:** los intereses y comisiones sí computan (Comisiones e intereses); el principal ya se contó en la compra.
- **Movimientos entre cuentas propias:** cualquier transferencia entre dos cuentas dadas de alta se marca como traspaso interno en ambos lados.
- **Devoluciones en tarjeta:** se registran con importe positivo en la categoría de la compra y restan gasto.

## 8. Extracto mensual y vistas

El extracto mensual es la pantalla de inicio y solo cuenta movimientos de tipo Normal.

**Extracto mensual**

- Arriba, en dos filas (v0.31.0): el capital (saldo de las cuentas según el banco menos lo gastado con la tarjeta pendiente de cargar) con su variación del mes, y la deuda con el pago previsto. El detalle de «Tu posición» (cada cuenta, tarjeta y evolución) está en su pantalla.
- Tarjeta principal del mes (v0.31.0): gastado frente a la media de los meses anteriores disponibles (hasta 12), barra con el presupuesto o la media y el cierre previsto, la categoría que más sube, e ingresos, ahorro y tasa de ahorro. La comparación completa (media y hace un año) y la previsión, en «Cómo se calcula».
- Desglose por categoría con importe, peso sobre el gasto total y diferencia con la media cuando es relevante (al menos 20 € y un 15 %); las seis primeras y «Ver todas».
- Avisos agrupados en «Cosas pendientes»; las acciones (PDF, evolución anual, Claude y Excel), en el menú «…».
- Al tocar una categoría se abren sus movimientos del mes.
- Aviso visible si hay movimientos sin categoría, mejoras de categoría o descuadres con el banco.
- Navegación mes a mes con una tira de meses de botones grandes, siempre enteros (sin gesto lateral desde la v0.26.0).
- Aviso cuando una cuenta o la tarjeta lleva 5 días o más sin subir datos del banco.

**Vistas de análisis**

| Vista | Contenido |
| --- | --- |
| Evolución | Ingresos, gastos y ahorro por mes en todo el histórico |
| Categorías | Evolución de una categoría concreta y su media móvil |
| Anual | Cierre por año natural y comparativa entre años |
| Movimientos | Lista completa con búsqueda y filtros por cuenta, categoría, tipo e importe |

**Exportación:** cualquier vista se exporta a Excel con los movimientos que la componen.

## 8 bis. Resúmenes semanal y mensual en PDF (v0.2.0)

Pantalla Resúmenes (en el móvil, desde el Extracto; en escritorio, en el menú lateral). Se elige semanal o mensual, se navega por periodos y se genera el PDF para compartir con la hoja de compartir del iPhone o descargarlo. Todo se calcula y se genera en el dispositivo.

- **Periodos:** semana de lunes a domingo y mes natural. La comparativa es siempre con el periodo anterior (semana anterior o mes anterior). Si el periodo está en curso, se compara con los mismos días del anterior y se indica en pantalla y en el PDF.
- **Cálculo:** solo computan los movimientos de tipo Normal. En una categoría de gasto, una devolución resta gasto; sin categoría, se clasifica por el signo.
- **Plan de pagos (v0.28.0):** si hay deuda configurada y está activado «Incluir el plan de pagos», el PDF (completo o para compartir) lleva el calendario de pagos del plan actual y con las nóminas que no cuentan en la previsión, el año en que queda saldada y el capital previsto a 12 y 24 meses con su gráfico.
- **Contenido común:** ingresos, gastos, ahorro y tasa de ahorro con su variación; gasto por categoría con peso, importe del periodo anterior y diferencia; bloque «Fuera del extracto» con gastos de empleado, reembolsos, traspasos y pagos de deuda (solo lo que haya).
- **Semanal:** todos los movimientos de la semana por día, con los que no computan en gris.
- **Mensual:** subcategorías, ingresos por concepto, tabla semana a semana (semanas recortadas al mes) y los diez mayores gastos.
- **Para compartir (v0.3.0):** versión reducida del PDF con indicadores y gasto por categoría, sin subcategorías, movimientos ni gastos de empleado, en una página. Pensada para compartir con quien no tiene acceso a la app.
- **Privacidad:** en el PDF completo, opción para quitar los conceptos y dejar solo fechas, categorías e importes. El PDF parte de los datos ya anonimizados y avisa si incluye datos de prueba.

## 9. Presupuestos por categoría (fase 4)

Cada categoría o subcategoría puede tener un presupuesto mensual, y el extracto muestra cuánto se ha consumido y cómo se cerrará el mes.

- **Definición:** importe mensual por categoría, igual todos los meses o con excepciones en meses concretos (Viajes en agosto, Hijos en septiembre).
- **Propuesta inicial:** con pocos meses de datos se define a mano. Con tres o más meses, la app sugiere la media de cada categoría como punto de partida.
- **Seguimiento:** barra de consumo por categoría en el extracto, con lo gastado, lo que queda y la proyección a fin de mes según el ritmo de gasto.
- **Estado:** dentro, cerca del límite (a partir del 80 %) y superado, con color.
- **Vista anual:** presupuesto acumulado frente a gasto real por categoría.
- **Exclusiones:** los gastos de empleado, los traspasos internos y los pagos de deuda no consumen presupuesto.
- **Avisos:** al confirmar una importación, la app avisa de las categorías que han pasado del 80 % o del 100 %.

## 10. Deuda familiar y plan de pagos (fase 4)

La app proyecta el ahorro mes a mes, calcula cuánto se podrá transferir cada verano y en qué año queda saldada la deuda.

**Regla de pago (configurable)**

| Parámetro | Valor inicial |
| --- | --- |
| Deuda pendiente | Importe a 1 de octubre de 2026, se introduce en la app (no va en el repositorio) |
| Intereses | Sin intereses (confirmado por el usuario el 14/11/2026) |
| Colchón de ahorro | Importe que se introduce en la app, sobre el saldo de la Cuenta 2, la de ahorro (decisión del usuario del 14/11/2026). La cuenta principal queda para el día a día |
| Ventana de pago | Junio a agosto, con julio como mes de referencia para la proyección (confirmado el 14/11/2026) |
| Importe del pago | Todo el saldo de la Cuenta 2 que supere el colchón en la fecha de pago (confirmado el 14/11/2026) |

**Registro de los pagos**

- Las transferencias al familiar se identifican por regla y se marcan con el tipo Pago de deuda. No computan como gasto y reducen la deuda pendiente.
- En el concepto, el nombre del familiar se sustituye por el alias Familia.
- Se pueden registrar pagos fuera de la ventana si algún año se adelanta una parte.

**Proyección del ahorro**

Supuesto (14/11/2026): el ahorro de cada mes acaba en la Cuenta 2 con los traspasos habituales, y la cuenta principal mantiene su nivel. Por eso se proyecta el ahorro total y se suma al saldo de la Cuenta 2; el pago sale de la Cuenta 2.

1. Saldo de partida: saldo de la Cuenta 2 según el banco.
2. Más los gastos de empleado pendientes de reembolso, si el usuario los indica (la app ya no los calcula).
3. Más los ingresos previstos de cada mes: las nóminas netas que da de alta el usuario, con sus pagas extra y su bonus en su mes (v0.24.0 y v0.25.0), y el resto de ingresos según el historial. Sin nóminas dadas de alta, todo sale del historial (el mismo mes del año anterior o la media). Una nómina que no cuenta sirve para simular una segunda.
4. Menos los gastos previstos: presupuesto por categoría o, si no lo hay, la media de la categoría.
5. Menos los gastos puntuales conocidos, registrados como eventos previstos (IBI, seguros anuales, vacaciones, colegio).
6. Resultado en el mes de pago: saldo proyectado de la Cuenta 2 menos el colchón, igual al pago previsto (nunca negativo ni mayor que la deuda pendiente).

**Qué muestra la app**

- **Tarjeta en el extracto mensual:** deuda pendiente, pago previsto del próximo verano y cuánto ha sumado o restado el mes cerrado a ese pago, comparando el ahorro real con el previsto.
- **Calendario de pagos:** un año por fila con el pago previsto, la deuda pendiente tras el pago y el año en que queda saldada.
- **Simulación:** efecto en el pago, en el año de liquidación y en el capital previsto de otra deuda pendiente u otro colchón, ahorrar una cantidad distinta cada mes, recortar una categoría concreta o sumar o quitar una nómina o el bonus.
- **Seguimiento anual:** después de cada pago, la app compara lo previsto con lo transferido y recalcula el calendario.

**Datos que necesita:** el saldo de las cuentas en cada importación (columna de saldo del Excel de BBVA, a confirmar) y los eventos previstos del año.

## 11. Exportación a Claude (fase 4)

Sin coste: la app no usa la API de Anthropic. Abre Claude con los datos ya preparados y el análisis se hace dentro de la suscripción del usuario.

- **Botón Analizar con Claude** en el extracto mensual, en cada categoría, en presupuestos, en el plan de pagos y en la vista anual.
- **Resumen por enlace:** abre claude.ai con el prompt ya escrito y el resumen del periodo (totales por categoría, presupuesto y comparativa con la media). Comprobar que el prellenado por enlace sigue disponible. La longitud del enlace limita el volumen, así que no lleva el detalle de movimientos.
- **Detalle completo:** genera un CSV con los movimientos del periodo y lo envía a la app de Claude con la hoja de compartir de iOS (Web Share API). En escritorio, descarga el CSV y copia el prompt al portapapeles.
- **Plantillas de prompt** editables en ajustes: análisis del mes, desviaciones de presupuesto, gastos recurrentes y suscripciones, comparativa interanual, plan de pagos.
- **Datos que salen:** solo los del periodo elegido, ya anonimizados. Opción en ajustes para quitar los conceptos y enviar solo categorías e importes.

## 12. Experiencia en el móvil (escritorio en pausa)

El móvil es para consultar y marcar rápido; el escritorio, para importar, revisar en bloque y analizar.

| Función | Móvil | Escritorio |
| --- | --- | --- |
| Extracto mensual | Pantalla de inicio, una columna | Extracto y gráfico de evolución en paralelo |
| Marcar que no cuenta | Deslizar hacia la derecha | Selección múltiple y atajo de teclado |
| Importar | Desde Archivos o la hoja de compartir de iOS | Arrastrar el fichero |
| Revisión de importación | Tarjetas por bloque | Tabla editable |
| Categorizar | Detalle del movimiento | Edición en línea en la tabla |

Navegación con barra inferior de cuatro pestañas: Extracto, Movimientos, Informes y Ajustes (Informes desde la v0.7.0; Empleado retirada en la v0.15.0). Entre pestañas solo se cambia con la barra (v0.26.0). Ajustes es una lista agrupada al estilo del iPhone, con un apartado por pantalla. Tema Automático, Claro u Oscuro, a elegir en Ajustes, General.

**Escritorio: en pausa (13/11/2026).** La columna de escritorio de la tabla y el menú lateral se retoman solo cuando el usuario lo indique. Hoy la app es solo para el iPhone.

## 13. Hoja de ruta

La v1 trabaja solo con BBVA desde octubre de 2026 y queda completa al cerrar la fase 4. El análisis predictivo entra en la fase 5 (la carga de Fintonic se descarta). Todo se calcula en la propia app, sin servicios de pago.

| Fase | Contenido | Se cierra cuando |
| --- | --- | --- |
| 0. Preparación | Excel de octubre de las cuentas y la tarjeta de BBVA, plantillas de lectura, repositorio en GitHub y CLAUDE.md | El mapeo de BBVA está cerrado |
| 1. Base | Almacenamiento en el dispositivo, exportación e importación, modelo de datos, cuentas por alias y catálogo de categorías | Almacenamiento, modelo y catálogo operativos |
| 2. Importación BBVA | Cuentas y tarjeta, anonimización, deduplicación, reglas, revisión y traspasos internos | Octubre y noviembre importados sin duplicados, sin datos identificativos y sin doble cómputo de la tarjeta |
| 3. Extracto y gastos de empleado | Extracto mensual, marcado rápido y vistas de análisis | Octubre y noviembre cerrados |
| 4. Presupuestos, plan de pagos y Claude | Presupuesto por categoría, plan de pagos de la deuda familiar con proyección y simulación, y botón Analizar con Claude | Presupuesto de diciembre definido, pago del verano de 2027 proyectado y primer análisis hecho en Claude |
| 5. Análisis predictivo | Marcado a posteriori de gastos de empleado del histórico. Proyección de cierre de mes, gastos recurrentes (suscripciones, seguros, IBI), previsión de gastos anuales por estacionalidad y alerta de gastos atípicos | Previsiones contrastadas con el real de tres meses |
| 6. Mejoras | Importación de PDF, Face ID, sugerencia de categoría por similitud, notificaciones, otras entidades | Según uso |

## 14. Decisiones abiertas

- [x] Excel de cuenta de BBVA para fijar la plantilla (recibido el 13/11/2026).
- [ ] Excel de la tarjeta de crédito de BBVA para fijar su plantilla.
- [x] Transferencia de reembolso: ya no hace falta, el usuario marca los reembolsos a mano (v0.15.0).
- [x] Deuda familiar sin intereses; colchón sobre la Cuenta 2; pago de todo lo que lo supere, de junio a agosto con julio de referencia (14/11/2026).
- [ ] Confirmar la entidad de cada cuenta y de la hipoteca, y desde qué cuenta se paga la cuota.
- [ ] Comprobar que claude.ai sigue admitiendo el prompt prellenado por enlace.
