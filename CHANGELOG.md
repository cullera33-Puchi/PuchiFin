# Registro de cambios

Lo entregado en cada versión, con detalle técnico. Las líneas para el usuario van en `public/novedades.json`.

## v0.35.0. Exportación a Claude completa (14 de noviembre de 2026)

Lo que faltaba del apartado 11, pedido por el usuario.

- Detalle completo (`src/lib/csvClaude.ts`): «Enviar con el detalle» en la hoja de Analizar con Claude manda un CSV con los movimientos de la vista (fecha, mes en que cuenta, cuenta, concepto, categoría, subcategoría, tipo e importe) junto con el texto, por la hoja de compartir; el texto se copia antes por si la app de destino no lo recoge. Sin hoja de compartir, descarga el CSV. Sin notas ni saldos; cualquier número identificativo se vuelve a enmascarar. Extracto y Presupuesto, el mes; Informes, el mes o el año; Plan de pagos, los doce meses completos anteriores; Gastos fijos, los cargos de los fijos activos.
- Plantillas editables (`src/lib/plantillas.ts`, Ajustes, Analizar con Claude, `/ajustes/claude`): análisis del mes, comparativa con el periodo anterior, desviaciones de presupuesto, gastos recurrentes y suscripciones, y plan de pagos. Solo se guarda lo que cambia el usuario; vacía o igual que la de la app, vuelve a la de la app. La cabecera con el periodo y los datos los pone siempre la app. Hasta 2.000 caracteres y sin datos identificativos (`guardarPlantillaClaude`, también en `comprobarBaseDatos`).
- Enviar sin comercios (`fijarSinConceptos`): el texto no lleva los comercios (informes, gastos hormiga) y los fijos salen por su categoría; el CSV va sin la columna Concepto.
- Esquema 14: `ajustes.claude` (`plantillas` y `sin_conceptos`), con su paso en `migrar()` y archivo de prueba del esquema 13. General conserva este ajuste al guardar.

## v0.34.1. Excel real de la tarjeta de crédito (14 de noviembre de 2026)

Formato confirmado con un Excel real del usuario (no se guarda en el repositorio): «Informe BBVA» con la cabecera en la fila 5 y las columnas Fecha, Concepto, Movimiento, Importe y Divisa. Sin saldo, compras en negativo, Movimiento vacío o con la categoría de BBVA.

- `partirAnchoFijo` con país de ancho 0: la tarjeta trae el comercio en 25 caracteres y la población recortada detrás (5 letras); se separa si el comercio va relleno con espacios. Antes, la población quedaba pegada al nombre del comercio. Plantilla `bbva-tarjeta.json` con `concepto_ancho_fijo` `[25, 13, 0]` y la nota confirmada.
- Deduplicación de la tarjeta: una compra aún sin liquidar (solo el comercio) que vuelve a llegar liquidada (nombre recortado a 25 y con la población) se reconoce como la misma si coinciden día, importe y el principio del nombre.
- Excel de prueba de la tarjeta con el formato real; pruebas con filas inventadas en `formatoReal.test.ts`.

## v0.34.0. Reporting del análisis (R2 a R5), cálculos compartidos y revisión general (14 de noviembre de 2026)

- P2, más cálculos guardados por versión de los datos: `calcularExtracto` (por mes y día), `avisosRecurrentes` y `efectoMesCerrado`.
- R2, gastos fuera de lo normal (`src/lib/atipicos.ts`): en un comercio con al menos tres cargos en el año anterior, uno que pasa de 1,6 veces la mediana y la supera en 30 € o más; y un gasto de 300 € o más en un comercio sin cargos en un año (PayPal, solo este caso). Fila en el Extracto bajo la tarjeta del mes, con la lista y el motivo de cada uno, y sección en Informes, Comercios (escala de mes).
- R3, ahorro y gasto fijo mes a mes (`ahorroYFijoPorMes`, `AhorroYFijo`): barras apiladas de fijo y variable de los últimos doce meses, la tasa de ahorro debajo y el porcentaje medio del gasto que son recibos. En Informes, Evolución. Los meses incompletos, atenuados.
- R4, comparar periodos (`src/lib/comparar.ts`, `/informes/comparar`): meses, trimestres o años; por defecto, el más reciente frente al mismo del año anterior. Totales con su diferencia y gasto por categoría ordenado por cambio. Acceso con el icono de flechas de Informes.
- R5, resumen del año (`src/lib/anual.ts`, `/informes/anual`, `generarPdfAnual`): totales frente al año anterior, gasto medio y fijo, mejor y peor mes completo, capital al empezar y al acabar, deuda pagada y pendiente, categorías y comercios que más pesan; en PDF de una página. Acceso desde Informes en la escala de año.
- Tema: `marca-300` y `marca-400` en la paleta.

**Revisión general del código.** Tres revisiones independientes (cálculos, datos e importación, pantallas y gestos) con unos 30 hallazgos, todos corregidos y con sus pruebas:

- Guardado: un fallo al escribir en el dispositivo dejaba la cola de guardado rechazada y no se guardaba nada más hasta cerrar la app; una transacción abortada sin error dejaba la espera colgada (`almacen.ts`, `copias.ts`).
- Tipo puesto a mano (esquema 13, `tipo_manual`): un traspaso devuelto a Normal, o un movimiento marcado con «Cuenta» o «No cuenta», ya no lo vuelve a cambiar una regla al publicar una versión ni al emparejar traspasos. Archivo de prueba del esquema 12.
- Deshacer una importación se bloquea si hay otra posterior de la misma cuenta con las mismas fechas (dejaría un hueco).
- `aplicarVersion` aplica la lógica sobre los datos del momento de guardar, no sobre los de antes de la copia.
- Anonimización: el último paso enmascara todo lo que reconoce la verificación final (IBAN extranjeros compactos, cuentas con puntos); la población se enmascara y entra en la verificación final y en `comprobarBaseDatos`.
- Reglas importadas de Claude: una regla por importe exacto no se confunde con la de todo el comercio. Las copias manuales no se borran solas. Al fusionar categorías, los presupuestos suman también sus meses especiales. La deduplicación no cuenta los datos de prueba como ya importados.
- Cálculos: el cuadre de saldo elige bien el orden de una compra y su devolución el mismo día; la comparativa con el periodo anterior y el resumen cortan en la fecha del último dato, no en la de hoy; julio de este año sin pago previsto si ya se pagó en la ventana; «15.000» se lee como quince mil; las cachés distinguen el modo discreto.
- Pantallas: los filtros parten de los aplicados al abrirlos; activar el modo discreto no borra lo escrito en Ajustes, General; Categorizar suelta lo excluido de un grupo ya aplicado; un segundo dedo durante el gesto de volver o el arrastre de una hoja la devuelve a su sitio; una hoja que se reabre mientras sale ya no se cierra sola; las hojas de listas que se vacían se cierran; Importar explica qué hacer si no hay una cuenta activa del tipo del fichero; un filtro de cuenta desactivada se ve como chip; las acciones de la selección usan solo lo seleccionado que se ve; «Ver los del mismo comercio» empieza sin filtros; la nota no se queda en «Guardando…»; el saldo confirmado admite negativos; el quesito suelta la porción al cambiar de periodo; la bienvenida ya no habla de gestos retirados.

## v0.33.0. Usabilidad y visual del análisis: modo discreto, Herramientas por apartados, PDF al cerrar el mes e Informes por vistas (14 de noviembre de 2026)

- U4, modo discreto (`src/lib/discreto.ts`, `useDiscreto`): oculta los importes en toda la app («•••• €» en `formatearImporte` y `formatearRedondo`, «••» en los ejes de los gráficos). Se activa con el ojo del Extracto, el de «Tu posición» o Ajustes, General; la pantalla se vuelve a pintar al cambiarlo. Lo que sale de la app lleva las cifras reales (`sinDiscreto` en la generación del PDF). Misma clave en el dispositivo que el ojo de antes.
- U5, Herramientas por apartados (`ListaHerramientas`, `ApartadoHerramientas`, `/ajustes/herramientas/:apartado`): Copias y archivo, Categorizar con Claude, Datos y Excel de prueba, Empezar de cero, Registro y Versión, cada uno con «‹ Herramientas». Los avisos del Extracto, el cierre de mes y la importación enlazan al apartado que toca.
- U6, al completar el cierre de mes, «Compartir el resumen de…» genera el PDF para compartir del mes con el plan de pagos (`src/lib/compartirMes.ts`); «Más opciones» lleva a Resúmenes.
- V2, Informes en tres vistas (Categorías, Comercios y Evolución) bajo los totales, con la elegida en la dirección (`ver`); solo se pinta la vista elegida. Entrar en Informes pasa de 0,94 s a 0,53 s con la CPU cuatro veces más lenta.
- `BarraNavegacion` se mantiene; pruebas de navegador del modo discreto, los apartados de Herramientas y las vistas de Informes.

## v0.32.0. Primer lote de mejoras del análisis: usabilidad, visual, reporting y rendimiento (14 de noviembre de 2026)

Análisis de la app con unos 1.670 movimientos; el usuario aprueba el primer lote (U1 a U3, V1, V3, V4, R1, P1, P3 y P4).

- U1, Movimientos más ligero: «Categorizar» y «PayPal» pasan a chips junto a «Sin categoría» y las cuentas; la ayuda de deslizar sale las tres primeras veces; la suma de los de tipo Normal, solo con búsqueda o filtros.
- U2, Movimientos recuerda la búsqueda, los filtros, las filas cargadas y el sitio al volver de otra pestaña (en memoria mientras la app está abierta; un enlace con búsqueda manda sobre lo recordado).
- U3, sin «Restaurantes, Restaurantes»: si la subcategoría se llama como su categoría, el nombre sale una vez (`nombreCategoria`, PDF y Categorizar).
- V1, Informes con el estilo del Extracto: importes redondos, diferencias frente al periodo anterior con color y solo si son relevantes (al menos 20 € y un 15 % en las categorías), sin «Hace un año» vacío, y el ahorro en su propia tarjeta en lugar de la frase.
- V3, el mismo color por categoría en el quesito y la leyenda de Informes que en el Extracto; si se repiten (subcategorías), la paleta del gráfico.
- V4, importes redondos en los totales del Plan de pagos, Gastos fijos, Presupuesto y Gastos previstos; los cargos sueltos conservan los céntimos.
- R1, «Te quedan X € hasta fin de mes, unos Y € al día» en la tarjeta del mes en curso: la referencia (presupuesto o media) menos lo gastado, los recibos que faltan y los previstos. Corrección: el presupuesto solo es la referencia de la tarjeta si cubre al menos el 80 % del gasto medio.
- P1, Movimientos pinta 40 filas y carga las siguientes al acercarse al final (`IntersectionObserver`); antes, 120 de golpe.
- P3, la búsqueda filtra con `useDeferredValue`: el teclado no se bloquea.
- P4 y parte de P2: cálculos guardados por versión de los datos (`src/lib/cache.ts`, `porVersion` y `porVersionYClave`) para las propuestas de recategorización, los grupos de PayPal, los recurrentes, la posición de 12 meses, las liquidaciones de la tarjeta y los pasos del cierre de mes.
- Medido con la CPU cuatro veces más lenta: arranque del Extracto de 1,1 s a 0,74 s, pestaña Movimientos de 1,04 s a 0,44 s, vuelta al Extracto de 0,62 s a 0,40 s.

## v0.31.0. Extracto rediseñado, menos recargado (14 de noviembre de 2026)

Propuesta de diseño aprobada por el usuario («aplica todo»). La pantalla pasa de unas 2,5 a 1,4 alturas de iPhone con un año de datos.

- Capital y deuda en dos filas compactas (`FilasPatrimonio`): capital con la variación del mes y deuda con el pago previsto y el año en que queda saldada; respetan el ojo que oculta las cifras. El detalle de «Tu posición» pasa a su pantalla (`/extracto/posicion`).
- Tarjeta principal del mes (`TarjetaMes`) en lugar de la frase, la previsión, la nota de la media y las cuatro tarjetas: gastado en grande frente a la media, barra con la referencia (presupuesto o media) y lo que falta hasta el cierre previsto, la categoría que más sube (`categoriaQueMasSube`) y una fila con ingresos, ahorro y tasa de ahorro. «Cómo se calcula» (icono de información) abre la comparación con la media y hace un año, la previsión con sus recibos y los accesos a gastos e ingresos previstos.
- Avisos agrupados (`usePendientes`, `Pendientes`): datos de prueba, subir movimientos, exportar, recibos, cierre de mes, cuadre, mejoras, sin categoría y presupuesto sin definir. Uno se ve tal cual; varios, en una fila «Cosas pendientes» que abre la lista. Fuera los banners de arriba.
- Categorías: las seis primeras y «Ver todas»; la diferencia con la media solo si es relevante, al menos 20 € y un 15 % (`diferenciaRelevante`).
- Acciones en el menú «…» de arriba: Resúmenes en PDF, Evolución y cierre anual, Analizar con Claude y Exportar el mes a Excel. Junto al menú, el acceso directo al PDF.
- Importes redondos en los resúmenes; los céntimos quedan en las listas de movimientos.

## v0.30.0. Los comercios de Informes responden al primer toque (14 de noviembre de 2026)

- `touch-action: manipulation` en toda la app (capa base): Safari en el iPhone ya no espera un posible doble toque para hacer zoom. Con dos o tres toques seguidos, se quedaba con ellos y la fila no respondía. Los gestos propios (filas, hojas) mantienen su `touch-action`.
- «Dónde más gastas» y «Gastos hormiga»: tocar un comercio abre una hoja con sus movimientos del periodo (`HojaComercio`, `movimientosDeComercio`), dentro de Informes y sin montar la pestaña Movimientos; cada fila abre su detalle y admite los gestos de siempre. «Ver en Movimientos» lleva a la lista completa. Registro «Informes: comercio abierto» con el número de movimientos.
- Recorrido de navegador: tocar un comercio abre su hoja y «Ver en Movimientos» lleva a la búsqueda.

## v0.29.0. Volver deslizando, más fluido (14 de noviembre de 2026)

- `useVolverDesdeBorde` ya no usa estado de React: el desplazamiento se aplica directamente a la capa de la pantalla (`translate3d`), una vez por fotograma (`requestAnimationFrame`), con `will-change` solo mientras dura el gesto. Antes, cada movimiento del dedo redibujaba la estructura de la app y pintaba una sombra de 24 px sobre toda la pantalla.
- La sombra del borde es una franja fija aparte que se mueve con la pantalla. La animación al soltar dura 0,3 s y se limpian fotogramas y temporizadores al cambiar de pantalla.

## v0.28.0. Plan de pagos más rápido, a mano y en el PDF (14 de noviembre de 2026)

- Rendimiento: las estadísticas por mes y el capital de hoy (`calcularPosicion`) se calculan una vez por cada versión de los datos (`WeakMap` en `plan.ts`); la simulación solo recalcula la proyección. Con unos 1.000 movimientos, cada cambio de la simulación pasa de unos 14 ms a menos de 1 ms (antes se repetía hasta cuatro veces por pulsación en Ingresos previstos). El cálculo usa `useDeferredValue`: los campos no se bloquean al escribir.
- Coherencia: una sola simulación compartida entre Ingresos previstos y el Plan de pagos (`useSimulacion`, en memoria mientras la app está abierta), con «Restablecer» en las dos y aviso en Ingresos cuando cuenta algo cambiado en el plan. `haySimulacion` reúne la comprobación.
- Acceso: `TarjetaDeuda` (componente propio) justo debajo de «Tu posición» en el Extracto, fuera de los meses, y en Informes; sin deuda configurada, invita a configurarla. «Compartir en PDF» en el plan.
- PDF de los resúmenes: apartado «Plan de pagos de la deuda» (`seccionPlan`) con la deuda, el colchón y el ahorro previsto, el calendario del plan actual y con las nóminas que no cuentan (`escenarioNominas`), el año en que queda saldada, el gráfico del capital previsto con leyenda y las cifras a 12 y 24 meses. En el completo y en el de compartir, con el interruptor «Incluir el plan de pagos» en Resúmenes (activado por defecto).

## v0.27.0. Deuda y colchón editables en la simulación del plan de pagos (14 de noviembre de 2026)

- `Simulacion.deuda` y `Simulacion.colchon`: otra deuda pendiente u otro colchón solo en la simulación (`calcularPlan` los usa en lugar de los guardados).
- Plan de pagos: campos «Deuda pendiente» y «Colchón» al principio de la simulación, con los importes del plan; al cambiarlos se recalculan el primer pago, el año de liquidación y el capital previsto. «Guardar estos importes» los deja en el plan (la deuda se guarda a la fecha de referencia, sumando lo ya pagado) y «Restablecer» quita toda la simulación.
- El texto para Claude incluye la deuda y el colchón simulados. Test de la simulación y recorrido de navegador que cambia el colchón y lo guarda.

## v0.26.0. Sin gestos laterales entre pestañas, tira de meses sin cortes y Ajustes en lista (14 de noviembre de 2026)

- Gestos (decisión del usuario): fuera `useCambioDePestana` (entre pestañas solo con la barra) y el cambio de mes o periodo deslizando en el Extracto e Informes (`Deslizable` se queda solo en Resúmenes). En las pantallas principales el único gesto lateral es el de las filas; volver deslizando sigue en las pantallas apiladas. `RAICES` queda en las cuatro pestañas.
- `TiraPeriodos`: ocupa el ancho de las tarjetas y cada botón una quinta parte, con encaje al soltar (`snap-mandatory`, `snap-start`): siempre cinco meses enteros, sin medios botones en los bordes. El elegido se coloca hacia el centro, encajado.
- Ajustes al estilo del iPhone: lista agrupada (Datos: Cuentas, Categorías y Reglas; Planificación: Nóminas e ingresos, Presupuesto, Gastos previstos y Plan de pagos; App: General y Copias, archivo y herramientas), con recuentos y la versión al pie. Cada apartado es una pantalla apilada (`PaginaAjuste`) con «‹ Ajustes». Fuera las pestañas de arriba; General pierde los accesos que pasan a la lista.
- `BarraNavegacion`: `inicio` (adónde vuelve sin pantalla anterior) y la etiqueta de vuelta desde `location.state.atras`, para que las pantallas del Extracto abiertas desde Ajustes digan «‹ Ajustes».
- Recorrido de navegador: las pestañas solo con la barra, deslizar en Informes no cambia de pestaña ni de periodo, y Ajustes abre y vuelve deslizando.

## v0.25.0. Bonus anual en la nómina (14 de noviembre de 2026)

- Esquema 12: `bonus` en cada nómina (mes e importe neto, aparte de las pagas extra; la migración lo deja en null). Comprobaciones en `guardarNomina`.
- Previsión: `bonusNomina` suma el bonus en su mes, dentro de las fechas de la nómina. `Simulacion.bonus` lo quita solo en la simulación; `simulaNominas` detecta cualquier cambio de nóminas o bonus. El desglose de cada mes separa el bonus.
- Pantalla Ingresos previstos: bloque Bonus en la hoja de la nómina (julio por defecto) e interruptor «Bonus de julio» en la simulación, también en el plan de pagos. El texto para Claude incluye el bonus y su simulación.
- Archivo de prueba del esquema 11; el recorrido de navegador da de alta un bonus y comprueba que sin él baja el pago de julio.

## v0.24.0. Previsión de ingresos con nóminas y simulación de una segunda (14 de noviembre de 2026)

- Esquema 11: `nominas` en los ajustes (`Nomina`: nombre, neto mensual, pagas extra por mes, desde y hasta, incluida). `guardarNomina` y `borrarNomina` con sus comprobaciones (nombre único y sin datos identificativos, neto y pagas mayores que cero, una paga por mes, desde antes que hasta). La pantalla General ya no pisa las nóminas ni la versión de la lógica al guardar sus ajustes.
- Previsión (`src/lib/plan.ts`): con alguna nómina incluida, los ingresos de cada mes son esas nóminas (`importeNomina`: mensual más la paga extra de ese mes, dentro de sus fechas) y el resto de ingresos del historial sin la categoría Nómina; sin ninguna, todo sale del historial y las simuladas se suman. `Simulacion.nominas` suma o quita nóminas solo en la simulación. `preverIngresos`: ingresos de los 12 próximos meses con su desglose, ahorro mensual, capital dentro de un año y nómina real media como referencia.
- Plan de pagos: `serie` con el capital y el saldo de la cuenta de ahorro previstos a final de cada mes durante dos años (capital de hoy según la posición, más el ahorro previsto y menos los pagos). Gráfico «Capital previsto» (`GraficoCapital`) con la simulación al lado, y nóminas en la simulación. El texto para Claude incluye las nóminas (solo importes) y la simulación.
- Pantalla Ingresos previstos (`/extracto/ingresos`): nóminas con interruptor «cuenta en la previsión», alta y edición con pagas extra, simulación con su efecto en el ahorro, el capital, el pago de julio y el año en que se salda la deuda, y los 12 próximos meses. Accesos desde la previsión del Extracto, el plan de pagos y Ajustes, General.
- Archivo de prueba del esquema 10 y recorrido de navegador de la pantalla nueva.

## v0.23.0. Presupuesto completo, gastos previstos, plan de pagos y Analizar con Claude (14 de noviembre de 2026)

Puntos 1 a 6 de la hoja de ruta revisada (fase 4).

- Presupuesto: aviso al terminar una importación si una categoría pasa del umbral (80 %) o del 100 % en el mes en curso o el anterior (`avisosPresupuesto`); excepciones por mes con «Meses especiales» (`guardarExcepcionPresupuesto`; un presupuesto con solo excepciones se guarda con importe 0); vista anual con el presupuesto de cada mes frente a lo gastado (`presupuestoAnual`, desde enero o el primer mes completo, el mes en curso en proporción a los días con datos).
- Gastos previstos (`guardarEvento`, `borrarEvento`, `src/lib/previstos.ts`, pantalla `/extracto/previstos`): alta y edición de gastos o ingresos con fecha, importe y categoría opcional; estado pendiente, ya cargado (movimiento Normal del mismo signo a 20 días o menos, importe ±30 % y de la categoría) o no visto; «repetir el año que viene» (`mismoDiaEn`). Los pendientes del mes entran en `preverCierre` (`previstos`, `importePrevistos`), sin los que ya cubre un recibo recurrente de la misma categoría.
- Plan de pagos (`src/lib/plan.ts`, pantalla `/extracto/plan`): esquema 10, el colchón va sobre una cuenta (`base_colchon: 'cuenta'`, `cuenta_colchon_id`; la migración elige la Cuenta 2 o la segunda cuenta). `guardarCompromiso` (deuda a una fecha, colchón, cuenta, ventana y mes de referencia, sin intereses). `calcularPlan`: saldo de la cuenta según el banco más el ahorro previsto de cada mes (ingresos del mismo mes del año anterior o la media; gastos del presupuesto o la media de cada categoría; previstos pendientes), pago en el mes de referencia de todo lo que supere el colchón sin pasar de la deuda, hasta saldarla (máximo 30 años). Deuda pendiente: inicial menos los movimientos Pago de deuda desde la fecha. Simulación con ahorro extra o recorte de una categoría. `efectoMesCerrado`: ahorro real del último mes cerrado frente al previsto con los meses anteriores. Tarjeta en el Extracto, acceso desde Ajustes, General.
- Analizar con Claude (`src/lib/analizar.ts`, `HojaClaude` y `BotonClaude`): textos del Extracto, Informes (con los comercios que más pesan), Presupuesto y Plan de pagos, enmascarados y sin cuentas; copiar, compartir o abrir claude.ai. «Optimizar con Claude» usa la misma hoja.
- Archivos de prueba: esquema 9 en `tests/fixtures/archivos` y en las pruebas de navegador.
- Pruebas: 390 tests unitarios y 10 recorridos de navegador.

## v0.22.0. Mejoras 8 a 16 de la hoja de ruta, revisión y optimización (14 de noviembre de 2026)

- Gastos fijos y recurrentes (`src/lib/recurrentes.ts`): `detectarRecurrentes` agrupa los gastos de tipo Normal por comercio (PayPal, por importe), clasifica la periodicidad por la mediana de los intervalos (mensual, bimestral, trimestral, semestral, anual) y descarta importes muy dispares; importe, coste al mes y al año, próximo cargo, activo o de baja y subida. `resumenFijos`, `fijoYVariable` y `avisosRecurrentes` (subida reciente, cargo que no llega con la fecha de los datos de cada cuenta, cargo nuevo que se repite si la cuenta ya tenía datos antes). Pantalla `/informes/fijos`, tarjeta en Informes y aviso en el Extracto.
- Previsión de cierre (`src/lib/prevision.ts`): gastado, recibos pendientes del mes (sin los que se imputan al mes siguiente) y gasto variable al ritmo diario de hasta 3 meses anteriores.
- Presupuesto (`guardarPresupuesto` en `operaciones.ts`, `src/lib/presupuesto.ts`): consumo por categoría con estado según `umbral_aviso_presupuesto` y proyección desde el día 5; `sugerirPresupuestos` con la media de 3 meses redondeada a 10 €. Pantalla `/extracto/presupuesto` y barras en el Extracto.
- Optimizar con Claude (`src/lib/optimizar.ts`): texto con fijos, subidas y gastos hormiga, enmascarado; copiar, compartir o abrir `claude.ai/new?q=` (si el enlace es largo, solo abre el chat y el texto queda copiado).
- Gestos: pulsación larga de 500 ms en `FilaDeslizable` con menú (categoría, que no cuente, nota, mismo comercio); `useCambioDePestana` en las pantallas principales, fuera de filas, cambio de mes, tiras, campos y hojas.
- Teclado (guía 6.4): `--kb` con `visualViewport`, la hoja sube y se limita en altura; si no se detecta el teclado en 1,2 s, la hoja pasa arriba. El campo enfocado queda a la vista.
- Pruebas de navegador: `@playwright/test` 1.63.0, `playwright.config.ts` (iPhone 13 con Chromium), `tests/e2e/app.e2e.ts` (arranque, pestañas, gestos, pantallas nuevas y archivos de los esquemas 3, 5, 7 y 8 de `tests/fixtures/archivos`). En `pruebas.yml` y en `publicar.yml` antes de publicar.
- Optimización: `clasificar` con reglas ordenadas en caché por lista y patrones normalizados en caché; `anadirA` para agrupar sin copiar listas (cuadre con el banco, categorizar, recurrentes, posición, importación); `ConClaude` se carga al abrir Herramientas, con lo que SheetJS sale del arranque (paquete principal de 928 a 423 KB). Cierre de mes de 35 a 11 ms y posición de 14 a 7 ms con 1.000 movimientos.
- Revisión de código (independiente) y correcciones:
  - Cierre de mes: una liquidación «anterior al inicio» (paga compras de antes de lo importado) ya no deja el paso pendiente para siempre. El cierre reutiliza liquidaciones, mejoras y PayPal que el Extracto ya tiene calculados.
  - Con los datos atrasados, la previsión, la frase del mes («a estas alturas») y la proyección del presupuesto miden hasta el último dato importado (`fechaDeLosDatos`), no hasta hoy. La previsión lo dice («con los datos hasta el…»).
  - La media de la previsión y la propuesta de presupuesto no usan el primer mes importado, casi siempre incompleto (`primerMes`).
  - Capital mes a mes: solo desde que hay datos de todas las cuentas y tarjetas; antes, una cuenta importada más tarde parecía ahorro.
  - Sin avisos de «subida» en recibos de importe variable (luz, agua).
  - «Lo que más sube» no puede ser «Sin categoría».
  - Movimientos busca también por la clave del comercio (los enlaces «del mismo comercio» desde Informes, Fijos y el menú encuentran lo que buscan) y aplica una búsqueda nueva aunque ya esté abierta; en PayPal, por importe (`min` y `max`). Campo `comercio` en `Recurrente`.
  - Gastos hormiga en un año con pocos meses de datos: cuenta los meses con datos.
  - Pulsación larga: el gesto termina al abrirse el menú (la fila no queda a medio deslizar). La hoja vuelve abajo al cerrarse aunque un campo tuviera el foco.
- Pruebas: 374 tests unitarios y 8 recorridos de navegador.

## v0.21.0. Mejoras de esfuerzo bajo de la hoja de ruta: reporting y usabilidad (13 de noviembre de 2026)

- El mes en una frase (`fraseDelMes` en `src/lib/extracto.ts`, `formatearRedondo`): lo gastado (hasta hoy si está en curso) frente a la media, la categoría que más sube (al menos 30 € y un 15 %) y el ahorro.
- Mismo mes del año anterior: `haceUnAno` en `calcularExtracto` (con los mismos días si el mes está en curso) y en `calcularInforme` (vista mensual). «Hace un año» en los indicadores del Extracto y en los totales de Informes.
- Ranking de comercios y gastos hormiga (`src/lib/comercios.ts`): `rankingComercios` por importe o por veces (PayPal junto) en Informes y en la categoría de un informe; `gastosHormiga` (compras de hasta 10 € en comercios que se repiten al menos 3 veces al mes, con ritmo anual). Tocar un comercio abre Movimientos con la búsqueda y el mes (`q` y `mes` en la dirección).
- Movimientos: chips por cuenta, «Cancelar» en la búsqueda (como en iOS) y búsqueda de tipo `search`.
- Cierre de mes guiado (`src/lib/cierre.ts`, pantalla `/extracto/cierre`): importar cada cuenta y la tarjeta hasta final de mes, cuadre con el banco, liquidación de la tarjeta, todo categorizado, PayPal repartido, mejoras de categoría y copia exportada. Aviso en el Extracto para el mes que se ve si ya pasó, o para el anterior en los 10 primeros días.
- Capital mes a mes en Informes: `calcularPosicion` añade el capital a final de cada mes (`pendienteTarjeta` con fecha y liquidaciones hasta entonces); gráfico de línea y tabla con el ahorro real (variación del capital) frente al ahorro del extracto.
- Pruebas: 353 tests.

## v0.20.0. Reclasificar en bloque revisando la lista (13 de noviembre de 2026)

- `HojaCorreccion` (`src/componentes/movimientos.tsx`): en lugar de interruptores con un recuento, `GrupoMarcable` lista cada movimiento (fecha, concepto, categoría actual, importe) con su casilla y «Todos» o «Ninguno» por grupo. Marcados de entrada: pendientes del mismo comercio y parecidos; en PayPal, también lo del mismo importe y el resto de cargos de PayPal que no eligió el usuario a mano. Lo ya categorizado de otros comercios, sin marcar. El botón dice a cuántos movimientos se aplica.
- `similares` añade `otrosPasarela` (los demás cargos de PayPal, de cualquier importe, que no están ya en la categoría) y `haySimilares`. En PayPal la regla se crea solo para el importe del movimiento elegido.
- Hoja de ruta de CLAUDE.md revisada: ordenada por esfuerzo, con prioridad para la usabilidad y el reporting.
- Pruebas: 339 tests.

## v0.19.1. La pantalla de detrás no se mueve con una hoja abierta (13 de noviembre de 2026)

- `Interfaz.tsx`: mientras haya una hoja abierta, un `touchmove` no pasivo en el documento anula el gesto si no hay una zona desplazable de la hoja bajo el dedo (cabecera, velo, contenido que cabe entero) o si esa zona ya está en su principio o su final en la dirección del gesto. Safari en el iPhone pasaba ese desplazamiento a la página aunque el contenido tuviera `overscroll-behavior: contain`. Los gestos laterales y el cierre arrastrando no cambian.
- Comprobado en el navegador con gestos táctiles: sin el cambio, un gesto sobre el velo desplazaba la página; con el cambio, no.

## v0.19.0. Tu posición: capital de un vistazo (13 de noviembre de 2026)

- `calcularPosicion` (`src/lib/posicion.ts`): saldo de cada cuenta bancaria activa según el banco (`cuadrarCuenta`, último Disponible), pendiente de cada tarjeta (`pendienteTarjeta` en `src/lib/tarjeta.ts`: lo posterior al último tramo liquidado; sin liquidaciones, el mes de la última compra, marcado como aproximado), capital (cuentas más pendiente), saldo de las cuentas a final de los últimos 12 meses y variación frente al cierre del mes anterior.
- `TarjetaPosicion` (`src/componentes/Posicion.tsx`) arriba del Extracto: capital, variación, línea de evolución (SVG propio, sin cargar Recharts en la pantalla de inicio), cuentas y tarjeta, y ojo para ocultar las cifras (preferencia del dispositivo en `localStorage`).
- Pruebas: 338 tests.

## v0.18.0. Tira de periodos, aviso de importación y registro más limpio (13 de noviembre de 2026)

- `TiraPeriodos` (`src/componentes/TiraPeriodos.tsx`, `opcionesMeses`, `opcionesAnios`): botones de 48 px que se deslizan de lado, el elegido resaltado y centrado. Sustituye a las flechas en el Extracto, en Informes y en la categoría de un informe. En el informe anual, tocar la barra de un mes abre ese mes arriba del todo.
- `avisoImportacion` (`src/lib/avisos.ts`, `DIAS_AVISO_IMPORTACION` = 5): cuentas y tarjetas activas ya importadas alguna vez cuya última importación real es de hace 5 días o más; aviso en el Extracto con enlace a Importar.
- Registro (`src/lib/registro.ts`): `sanearDescripcion` quita comercios, importes y nombres de categoría de las descripciones de los cambios (también de lo ya anotado, al leerlo); las entradas iguales seguidas en 10 minutos se agrupan con recuento (`n`, «(×N)»). En Herramientas, «Borrar» a la vista con confirmación y Deshacer.
- Análisis del registro enviado por el usuario: sin errores; un fallo puntual de red al buscar actualización; comercios en las descripciones de los cambios (corregido).
- Pruebas: 335 tests.

## v0.17.0. Crear una categoría al recategorizar, con aviso de parecidas (13 de noviembre de 2026)

- `categoriasParecidas` (`src/datos/parecidas.ts`): igual sin acentos, mayúsculas ni plural; parecida (una dentro de otra, errata o palabra en común); sinónimo (lista corta de grupos habituales). Ordenadas de más a menos parecida. Tests en `parecidas.test.ts`.
- `SelectorCategoria`: «Nueva categoría» arriba y «Crear «texto»» desde el buscador. `FormCrearCategoria` (`src/componentes/CrearCategoria.tsx`): nombre, dentro de qué categoría (por defecto la del movimiento) y gasto o ingreso si es principal; lista de parecidas con «Usar esta» (reactiva si estaba desactivada); la igual en el mismo nivel bloquea; «Crear igualmente» si hay parecidas. Al crear, se aplica al movimiento como cualquier elección (con su regla y «Deshacer»).
- Ajustes, Categorías: el alta muestra también las parecidas.
- Corregido: el aviso tras elegir una categoría recién creada decía «?» (nombre calculado con los datos anteriores).
- Pruebas: 331 tests.

## v0.16.1. Volver atrás sin cosas raras en Informes (13 de noviembre de 2026)

- `InformeCategoria` ya no está dentro de `Deslizable`: deslizar a la derecha cambiaba al mes anterior (la pantalla se iba y volvía) en lugar de volver. El periodo se cambia con las flechas.
- `useVolverDesdeBorde`: en pantallas apiladas, el gesto de volver empieza desde el borde o desde cualquier punto sin deslizamiento propio (filas, `Deslizable` con `data-deslizable`, campos, listas con desplazamiento horizontal); se decide tras 10 px (hacia la derecha y lateral), anula el scroll vertical mientras vuelve y no actúa con una hoja abierta. `Deslizable` cede los primeros 28 px al borde.
- La subcategoría elegida en un informe va en la dirección (`sub`) como un paso más: «atrás» la quita antes de volver a Informes; título y botón de volver lo reflejan.

## v0.16.0. Barra de pestañas flotante y repartir PayPal por importe (13 de noviembre de 2026)

- Barra de pestañas (`Estructura.tsx`, `index.css`): cápsula de cristal flotante de 62 px (`.cristal-pestanas`) con resalte deslizante de la pestaña activa, toque inmediato (`touch-action: manipulation`), respuesta al pulsar y pestañas a toda la altura de la cápsula. Antes, la franja del área segura bajo los iconos no respondía. Tocar la pestaña activa sube al principio. `--alto-pestanas` coloca avisos, barras flotantes y el final del contenido. Con una fila deslizada abierta, la barra responde al primer toque (`data-pestanas`).
- PayPal (`esPasarela`, `claveConImporte` en `lib/conceptos.ts`): lo aprendido, los grupos de Categorizar, «mismo comercio» y las reglas que se crean van por comercio e importe exacto (regla manual con `importe_min` y `importe_max`, prioridad 45). Sin parecidos por primera palabra.
- Pantalla Repartir PayPal (`/movimientos/paypal`, `gruposPasarela`, `categoriasPasarela`): cargos agrupados por importe, «Por revisar» (sin categoría o puesta por una regla) y «Todos», sugerencia del mismo importe, chips de un toque (lo ya usado en PayPal y las categorías típicas) y «Otra…». Acceso desde Movimientos y Categorizar, que ya no lista PayPal.
- Regla de la app «PayPal» retirada (`REGLAS_RETIRADAS`). Datos de prueba con cargos de PayPal.
- Pruebas: 327 tests.

## v0.15.2. Barra de pestañas a cuatro columnas (13 de noviembre de 2026)

- `Estructura.tsx`: la barra de pestañas seguía con cinco columnas tras quitar Empleado y dejaba un hueco a la derecha. Ahora son cuatro.

## v0.15.1. Gesto de las filas sin cambiar de pantalla y filtro por subcategoría (13 de noviembre de 2026)

- Gestos (`gestos.tsx`): un gesto que empieza sobre una fila deslizable (`data-fila-deslizable`) es solo de la fila. `Deslizable` (cambio de mes) lo ignora y `useVolverDesdeBorde` solo lo toma si empieza en los primeros 12 px de la pantalla, fuera de la fila. La fila se fija como horizontal solo con un movimiento claramente lateral (1,2 veces el vertical).
- Informes, categoría: las subcategorías del quesito filtran la lista de movimientos (marca, total y recuento de lo filtrado, «Ver todos»). La exportación a Excel sigue el filtro. El filtro se mantiene al cambiar de periodo.
- Prueba en navegador con gestos táctiles: deslizar a los dos lados en una categoría de Informes no cambia de periodo ni de pantalla.

## v0.15.0. Fuera la gestión de gastos de empleado; solo el marcado rápido (13 de noviembre de 2026)

- Se retiran la pestaña Empleado (`Empleado.tsx`, `RevisarEmpleado.tsx`; `/empleado` redirige al Extracto), la puntuación de posibles gastos de empleado (`importacion/empleado.ts`), la conciliación de reembolsos (`aplicado`, `gastosPendientes`, `proponerConciliacion`, `conciliar`, `desconciliar`, `indicadoresEmpleado`, `cerrarReembolso`, `marcarPersonal`), los avisos del Extracto, el pendiente de reembolso de los resúmenes y el PDF, y en Ajustes, General, la zona de casa y el aviso de días.
- Reglas de la app retiradas (`REGLAS_RETIRADAS`): «Reembolso de la empresa» y «Viajes de trabajo» (alojamiento y transporte). `sincronizarReglasApp` las quita del dispositivo al actualizar. Queda la sugerencia «Pago a la familia».
- Marcado rápido (`marcarFuera`, `alternarFuera`): un gasto pasa a gasto de empleado y un ingreso a reembolso; los traspasos y pagos de deuda no se tocan. Deslizar hacia la derecha muestra «No cuenta» o «Cuenta»; la categoría pasa a deslizar hacia la izquierda. En la selección múltiple de Movimientos, botón «Que no cuenten». La hoja Tipo del detalle ofrece el tipo que corresponde al signo.
- Sin cambio de esquema: los tipos, `conciliaciones` y los ajustes antiguos se conservan para leer los archivos anteriores. Barra de pestañas con cuatro secciones.
- Pruebas: 321 tests.

## v0.14.1. Cuadre de la tarjeta con compras fraccionadas y «Dar por buena» (13 de noviembre de 2026)

- `cuadrarLiquidaciones`: suma todo lo que pasa por la tarjeta (también los abonos de compras fraccionadas o financiadas, que son traspaso pero hacen que BBVA cobre menos) y excluye solo el pago de la propia liquidación («Rebut mes anterior», abono de la liquidación). Antes excluía todos los traspasos y las liquidaciones con compras fraccionadas salían como «no cuadra».
- «Dar por buena» y «Volver a revisar» en Ajustes, Cuentas, Liquidaciones de la tarjeta (`confirmarCuadreLiquidacion`, campo opcional `cuadre_confirmado`, esquema 9). Las confirmadas no cuentan en los avisos.
- Pruebas: 336 tests.

## v0.14.0. Sin fecha de inicio (13 de noviembre de 2026)

- La importación ya no descarta nada por fecha: entra todo lo que trae el Excel (también el histórico). Fuera la sección Fechas de Ajustes, la validación de la fecha de corte y el contador «Antes del inicio».
- Esquema 8: `fecha_inicio` y `fecha_corte_fintonic` salen de los ajustes; `migrar()` las quita de los datos y archivos anteriores.
- Liquidación de la tarjeta: el estado «anterior al inicio» se calcula con la primera compra importada de la tarjeta. Datos y Excel de prueba: mes en curso y los dos anteriores.
- Pruebas: 334 tests.

## v0.13.0. Taxis, IBI en Impuestos y categorías nuevas (13 de noviembre de 2026)

- Catálogo (esquema 7, `actualizarCatalogo` idempotente y sin cambiar identificadores): Transporte > Taxi y VTC; IBI y tasas pasa de Vivienda a Impuestos; nuevas Cuidado personal (Peluquería y estética, Perfumería y cosmética, Masajes y bienestar), Mascotas (Veterinario, Comida y accesorios), Formación (Estudios, Cursos y plataformas) y Efectivo (Retiradas de cajero).
- Reglas: taxis y VTC (también «Licencia» con la etiqueta Transporte), retiradas de efectivo, peluquería, perfumerías, masajes, veterinario y tiendas de mascotas, universidades y plataformas de cursos, recaudación municipal e IBI en Impuestos, «Abono por fraccionamiento de gastos» como traspaso y PayPal a Compras > Hogar con prioridad baja. Los taxis salen de Viajes > Transporte.
- Pruebas: 320 tests.

## v0.12.0. Lo aprendido de un año de movimientos reales (13 de noviembre de 2026)

- Lector: la categoría que BBVA añade en la columna Movimiento («Ocio», «Compras», «Transporte», «No categorizable», «Pendiente de categorizar gastos»…; `categorias_banco` en las plantillas) se trata como operación: queda en el concepto completo y fuera del nombre del comercio. El mismo comercio ya no se parte en dos claves.
- Liquidación de la tarjeta como la llama BBVA: «Adeudo mensual de tarjeta» en la cuenta y «Rebut mes anterior» en la tarjeta, traspasos internos. «Operación financiada» y «Operació finançada», traspasos (se anulan entre sí). Traspasos desde y hacia la tarjeta.
- Diccionario: bonÀrea (súper y, con la etiqueta Transporte, gasolinera), Carrefour abreviado, Opencor, Tesco, vending, cadenas de cafetería, «Benzinera», EESS, Cedipsa, zona regulada, BSM, Blinkay, peajes de AUCAT y túneles, Applus/ITV, «Tallers», comedor escolar (Ausolan), Pepe Mobile, campings, Tixalia, Entrapolis, bonificaciones del banco, comisiones en catalán, multas y tasas. Prioridades: peajes antes que bares, seguros antes que tecnología, colegio profesional como cuota.
- Reglas importadas: palabra clave con «~» (`tipo_patron` contiene) y reglas de tipo («Tipo: Pago de deuda»). Las reglas de tipo del usuario se aplican también a lo pendiente.
- Pruebas: 312 tests (conceptos nuevos del diccionario, etiqueta de BBVA, liquidación, palabras clave y tipos).

## v0.11.2. Copias que se ven completas (13 de noviembre de 2026)

- Las copias ya guardaban el documento completo de datos (movimientos, reglas, categorías, cuentas, importaciones, conciliaciones, ajustes y deuda). Ahora su resumen incluye el número de reglas (`resumenArchivo`, `MetaCopia.reglas`) y se muestra en la lista de copias.
- «Hacer copia ahora» ofrece «Guardar en Archivos» en el aviso, porque las copias viven dentro de la app y solo el archivo exportado sobrevive a borrarla.
- Test de copia y restauración con todo relleno (reglas manuales e importadas, saldo confirmado, ajustes, conciliaciones): idéntico campo a campo. 293 tests.

## v0.11.1. Empezar de cero (13 de noviembre de 2026)

- `empezarDeCero` en operaciones: borra movimientos, importaciones, conciliaciones, presupuestos, eventos previstos y saldos confirmados; conserva cuentas, categorías, ajustes y reglas de la app; reglas propias opcionales; o configuración inicial completa.
- Sección «Empezar de cero» en Herramientas, con copia «antes de borrar», confirmación y Deshacer. Pruebas: 292 tests.

## v0.11.0. Hoja de movimiento, interruptores Liquid Glass y categorizar con Claude (13 de noviembre de 2026)

- `Hoja`: prop `listo` para la acción de cabecera y cierre arrastrando desde el contenido (eventos táctiles nativos, solo con el contenido arriba del todo, por distancia o lanzamiento).
- `DetalleMovimiento` rediseñado y `useElegirCategoria` (sin hoja intermedia cuando no hay parecidos; regla creada y Deshacer). Selector de tipo como lista con descripción. Nota con guardado automático a los 600 ms.
- `Interruptor` Liquid Glass (clases `interruptor-*` en `index.css`), con movimiento reducido.
- `src/importacion/claude.ts`: `conceptosDeFila` (extraída de `proponer`), `resumirComercios`, `textoResumen`, `leerReglas` e `importarReglas`. Sección «Categorizar con Claude» en Herramientas (`ConClaude.tsx`).
- Pruebas: 290 tests. Prueba en navegador de la hoja, el interruptor, el resumen y la importación de reglas.

## v0.10.0. Categorización eficiente (13 de noviembre de 2026)

- Catálogo: Restaurantes y Ocio por separado y suscripciones por plataforma. `actualizarCatalogo` (esquema 6) renombra y recoloca sin cambiar identificadores: «Restaurantes y ocio» pasa a Restaurantes; sus subcategorías Ocio («Planes y salidas») y Cultura pasan a la nueva Ocio; «Plataformas» pasa a «Otras plataformas».
- Diccionario: 63 reglas de la app con unos 650 comercios y palabras clave (supermercados, comida rápida y a domicilio, cafeterías, bares, cines, gimnasios, plataformas, software, gasolineras, aparcamientos, peajes, transporte, talleres, colegios, farmacias, clínicas, ropa, tecnología, hogar, regalos, suministros, telefonía, seguros, impuestos y multas). Caché de expresiones regulares.
- `propuestasRecategorizacion` y `fijarCategoria`: mejoras para lo categorizado por regla, con Sí, No y «Aplicar todas» con confirmación; avisos en el Extracto y en Movimientos.
- Scroll: sin `transform` ni opacidad en reposo en `FilaDeslizable` y `Deslizable`; cabeceras fijas con `translateZ(0)`.
- Pruebas: 286 tests (45 conceptos del diccionario, catálogo nuevo y adaptación, mejoras propuestas).

## v0.9.0. Categorización rápida de lo pendiente (13 de noviembre de 2026)

- `src/datos/categorizar.ts`: `gruposPendientes` (pendientes por comercio y signo, ordenados por número de movimientos e importe), `sugerirPorParecido` (mismo comercio, misma primera palabra o índice de palabras en común con lo ya categorizado, ponderando lo manual; respeta la naturaleza gasto o ingreso), sugerencia por reglas de la app si no hay parecido, `categoriasRapidas` y `similares` (pendientes del mismo comercio, parecidos y ya categorizados por separado).
- Pantalla Categorizar: grupos con «Sí», «Otra», «Saltar», chips de un toque, casillas por movimiento, «Aceptar sugerencias claras» (confianza 0,8 o más) en un solo cambio con confirmación, interruptor «Crear reglas» y Deshacer en cada acción.
- `HojaCorreccion`: similares pendientes activados por defecto; lo ya categorizado del mismo comercio, desactivado (antes se cambiaba por defecto). Usa `useHacer` (Deshacer).
- Accesos desde el Extracto, Movimientos y el final de la importación.
- Pruebas: 236 tests. Prueba en navegador con una primera carga sin categorizar: sugerencias, «Sí», chips, sugerencias claras en bloque y corrección individual.

## v0.8.1. Scroll de Movimientos sin artefactos (13 de noviembre de 2026)

- Movimientos: la barra de búsqueda y filtros y las cabeceras de día eran fijas en la misma posición y se pisaban al hacer scroll. Ahora las cabeceras se paran debajo de la barra (variable `--alto-fijo`, medida con `ResizeObserver`).
- Cabeceras fijas con fondo sólido, sin `backdrop-filter`, que en iOS parpadea con el scroll por inercia.
- Franja fija del color del fondo bajo la barra de estado (`body::before`, guía 2.3) y elementos fijos por debajo del área segura superior.

## v0.8.0. Datos protegidos entre versiones, tarjeta por periodo de liquidación y hoja de ruta (13 de noviembre de 2026)

- Versiones nuevas sin romper lo que hay: `src/importacion/pendientes.ts` con `sincronizarReglasApp` (reglas de la app al día sin reactivar las desactivadas ni perder confirmaciones y descartes), `aplicarReglasAPendientes` (solo movimientos Normal sin categoría ni decisión del usuario; categoría por regla o aprendida, traspasos y liquidaciones; las sugerencias siguen pidiendo confirmación) y `actualizarLogica`, que se ejecuta una vez por versión al arrancar, con copia «antes de actualizar» y aviso del número de pendientes categorizados. Botón «Aplicar reglas a lo pendiente» en la bandeja Sin categoría, con Deshacer.
- Traspasos: no se emparejan con un movimiento categorizado a mano; las importaciones guardan la categoría anterior de lo que modifican y deshacer la devuelve.
- Esquema 5: `version_logica` en los ajustes y `modificados` con categoría. Prueba de compatibilidad con un archivo de la v0.6.0 (`src/datos/versiones.test.ts`).
- Liquidación de la tarjeta (`src/lib/tarjeta.ts`, `cuadrarLiquidaciones`): busca en los 45 días anteriores el tramo de días seguidos de compras de la tarjeta que suma exactamente el cargo, empezando después del tramo anterior; estados cuadra, no cuadra (con la diferencia frente al mes anterior), falta la tarjeta y anterior al inicio. Avisos al importar la cuenta o la tarjeta, fila y hoja en Ajustes, Cuentas, y aviso en el Extracto. Regla «Abono de la liquidación en la tarjeta».
- Cuenta propuesta al pegar: `descartadaPorSaldo` descarta la cuenta con saldos en esas fechas que no encajan; aviso si se elige igualmente.
- Hoja de ruta de mejoras en CLAUDE.md (gastos hormiga, gastos fijos y recurrentes, optimizar con Claude, cierre de mes guiado, pruebas de navegador en GitHub y calidad de vida).
- Pruebas: 231 tests. Prueba en navegador pegando las dos cuentas y la tarjeta, en ese orden.

## v0.7.0. Informes, cuadre con el banco, privacidad y guía de usabilidad (13 de noviembre de 2026)

- Privacidad: el repositorio deja de llevar el nombre del usuario y los importes personales de la deuda familiar (la deuda y el colchón empiezan a 0 y se introducen en la app). Revisados código, pruebas, plantillas, migraciones de Supabase en pausa, ficheros de prueba y paquete publicado: sin IBAN, tarjetas, DNI, correos ni nombres reales.
- Deduplicación en dos pasadas (`proponer`): primero por fecha, importe y saldo del banco tras el movimiento, que no depende de cómo se limpie el concepto (alias cambiados entre importaciones); después por fecha, importe y concepto para lo que no trae saldo (tarjeta). Emparejamiento uno a uno con lo guardado, así que dos cafés iguales el mismo día siguen siendo dos. Filas repetidas dentro del mismo fichero (pegar dos veces) se descartan. La revisión lista los «Ya importados».
- Cuenta reconocida por los saldos (`cuentaPorSaldo`): la que ya tiene esos movimientos o cuya cadena de saldos enlaza con la del fichero; manda sobre la última cuenta elegida. Aviso en la revisión si se elige otra.
- Cuadre de saldo (`src/lib/saldos.ts`, `cuadrarCuenta`): encadena los saldos del banco de cada movimiento sin depender del orden ni de las fechas de cargo; detecta repetidos (misma fecha, importe, saldo y concepto) y huecos (tramos sin importar, con el importe que falta). Se ve en la revisión, tras importar, en Ajustes, Cuentas (con «Quitar repetidos» y comprobación del saldo que el usuario ve en BBVA, `confirmarSaldo`) y como aviso en el Extracto. `borrarMovimientos` en operaciones. Datos de prueba con saldo en las cuentas bancarias.
- Esquema 4: `saldo_confirmado` en las cuentas, con migración.
- Informes (`src/lib/informes.ts`, `src/paginas/Informes.tsx`): gastos o ingresos de un mes o un año, quesito por categoría con las 7 mayores y «Otras», total en el centro, leyenda con peso y diferencia con el periodo anterior (mismos días si está en curso), barras de los últimos 6 meses o del año, detalle de una categoría con subcategorías y movimientos, exportación a Excel. Mismas reglas que el Extracto (tipo Normal, mes efectivo, devoluciones). Paleta categórica validada en claro y oscuro.
- Guía de usabilidad (`docs/guia-usabilidad-iphone.md`): barra de pestañas estándar translúcida de cinco pestañas con icono relleno; cabecera de 44 pt con título de 22 px y pantallas apiladas con título centrado; hojas con animación de 0,5 s, guardia de 450 ms contra toques fantasma, cierre por distancia o lanzamiento y pantalla de detrás encogida; confirmaciones como hoja de acciones; aviso de 4 s con «Deshacer» (`useHacer`, `intentarDeshacible`) en las acciones en bloque, quitar repetidos, borrar reglas y desvincular reembolsos; gestos con velocidad del dedo (`src/lib/velocidad.ts`), volver desde 28 px del borde y primer toque fuera de una fila abierta que solo la cierra; vibración con el interruptor oculto de iOS (`src/lib/haptica.ts`); tema Automático, Claro u Oscuro (`src/lib/tema.ts`, variante `dark` por `data-theme`); hoja de bienvenida con los gestos; vuelta a la pantalla principal tras dos horas fuera; cabeceras de grupo fijas con recuento; sin zoom por gesto ni selección de texto; reducir movimiento; singular y plural.
- Pruebas: 219 tests (cuadre de saldo, deduplicación con alias cambiados, filas pegadas dos veces, cuenta reconocida por los saldos, informes, velocidad). Prueba en navegador con gestos táctiles: importar, reimportar, informes, cuadre, bienvenida, hojas, filas y tema oscuro.

## v0.6.0. Formato real de BBVA, empleado, fin de mes y pegar (13 de noviembre de 2026)

- Lector: plantilla de cuenta con el formato real «Informe BBVA» (columnas confirmadas), concepto de ancho fijo [25, 13, 2] (`partirAnchoFijo`), columna Movimiento clasificada en operación, detalle o tercero (`operaciones`, `tercero_si_concepto`, `concepto_generico` en la plantilla), fecha «la anterior» entre Fecha y Fecha valor. Tarjeta con el mismo formato supuesto.
- Concepto: original completo anonimizado (comercio, población, detalle, alias del tercero, operación, observaciones); limpio con el comercio o el detalle; el nombre del titular u ordenante se sustituye por su alias (conservando desde palabras clave como GASTOS) o se quita; se quita la «N» de las referencias de adeudo.
- Reglas: se comparan con el texto completo; lo aprendido va por clave de comercio y por primera palabra sin ambigüedad (`categoriasAprendidas` devuelve `porClave`, `porPalabra` y `mesSiguiente`); las reglas de la app que cambian el tipo (traspasos, liquidación) mandan sobre lo aprendido; regla «Traspaso entre cuentas»; nómina e hipoteca con `mes_siguiente`; más supermercados, ropa, cafeterías, restaurantes, ocio y librerías (también en catalán). Las sugerencias llevan `confianza`.
- Empleado: puntuación (`puntuarEmpleado`), zona de casa deducida (`zonaCasa`), historial por comercio, `candidatosEmpleado`, `marcarPersonal`. Pantalla `/empleado/revisar`, aviso en Extracto y Empleado, petición del nombre de la empresa. En la importación solo cuenta como descarte lo seguro desactivado; lo dudoso queda para revisar.
- Fin de mes: `mes_imputacion`, `fechaEfectiva` y `mesEfectivo` en extracto, resúmenes, análisis, filtros y exportación (columna «Cuenta en»); `imputarMesSiguiente`; ajuste `dias_fin_de_mes` y zona de casa en Ajustes, General.
- Pegar: `leerTexto` (tabuladores, punto y coma, comas o HTML) y `leerPortapapeles`; botón Pegar con `navigator.clipboard.read()` y zona de pegado con el evento paste.
- Esquema 3 con migración. Datos y Excel de prueba con la nómina el último día laborable y la hipoteca el último día, imputadas al mes siguiente, y el formato real.
- Pruebas: 199 tests, entre ellos el formato real con filas inventadas, el pegado, la puntuación y el aprendizaje. El Excel real se probó en local sin guardarlo: 28 movimientos, sin datos identificativos, nombre del titular quitado y traspasos marcados.

## v0.5.0. Fases 2 y 3, gestos y Excel de prueba (13 de noviembre de 2026)

- SheetJS 0.20.3 desde cdn.sheetjs.com (la versión de npm es antigua y tiene vulnerabilidades al leer ficheros). Entorno de trabajo «PuchiFin» con ese servidor permitido.
- Importación (`src/importacion/`): plantillas JSON por origen (columnas, obligatorias, firma, signo); detección de la fila de cabeceras y del origen; lectura de fechas (texto, serie o fecha) e importes en formato español; anonimización (IBAN, cuentas y tarjetas aunque sean parciales, DNI y NIE; alias de terceros por nombre sin acentos ni mayúsculas; quitar nombres sin alias conservando el concepto desde palabras clave); concepto limpio y normalizado; descarte de lo anterior a la fecha de inicio; deduplicación por cuenta, fecha, importe y concepto con repeticiones; reglas manuales, aprendidas y de la app (36); sugerencias de gasto de empleado (incluido restaurante en día de viaje), reembolso y pago de deuda que se confirman o descartan y refuerzan o debilitan la regla; traspasos emparejados entre cuentas propias en los dos lados; aviso si la liquidación de la tarjeta no cuadra con el mes anterior; verificación final que bloquea; copia previa; deshacer con vuelta atrás de los traspasos emparejados.
- Esquema 2: importaciones con `modificados` y reglas de la app; `migrar()` adapta los datos y archivos de la v0.4 y se guardan ya adaptados.
- Fase 3: `calcularExtracto` con media de hasta 12 meses anteriores con datos (mes en curso, mismos días); `movimientosDeCategoria`; `cambiarCategoria` con mismo concepto y regla manual exacta; `cambiarTipo`, `alternarEmpleado`, `guardarNota`, `cerrarReembolso`; conciliación (`proponerConciliacion` con búsqueda exacta del más antiguo al más reciente, `conciliar` con aplicación parcial, `desconciliar`) e `indicadoresEmpleado`; evolución mensual, serie de categoría con media móvil de 3 meses y cierre anual; exportación a Excel de Extracto, Movimientos y Empleado.
- Pantallas: Extracto, Movimientos de una categoría, Movimientos (búsqueda, filtros, bandeja sin categoría, selección múltiple con categoría, empleado y tipo), Importar, Importaciones, Empleado (con hoja de conciliación), Análisis (Recharts con paleta validada para daltonismo y modo oscuro), Reglas; alias de terceros con nombres en Ajustes, General; Excel de prueba en Herramientas.
- Gestos (`src/componentes/gestos.tsx`): filas deslizables con acciones y ejecución al deslizar del todo, deslizar entre meses y periodos, volver desde el borde izquierdo y cerrar hojas arrastrando hacia abajo. Barras de navegación con «‹ Atrás» y cabeceras con los botones encima del título grande.
- Carga diferida de Análisis, Importar, la exportación a Excel y el PDF: el paquete inicial baja de 1,36 MB a 0,45 MB.
- Pruebas: 175 tests, entre ellos la importación completa de los tres Excel de prueba (sin datos identificativos, sin duplicados al reimportar, solapes, traspasos, liquidación, sugerencias y deshacer). Prueba en navegador con gestos táctiles reales: importar los tres Excel, deslizar entre meses y filas, seleccionar, conciliar, analizar y volver desde el borde.

## v0.4.2. Publicación en GitHub Pages (13 de noviembre de 2026)

- Flujo `.github/workflows/publicar.yml`: en cada envío a `main`, tests, build con `BASE_PATH=/<repositorio>/`, copia de `index.html` a `404.html` y publicación con `actions/deploy-pages`.
- La app admite una ruta base: `base` de Vite, `basename` del router, `start_url`, `scope` e `id` del manifiesto y lectura de `novedades.json` relativa a la base.
- Se retira `vercel.json`. Comprobado en un servidor que imita GitHub Pages: inicio, navegación, enlaces directos, service worker y novedades bajo `/PuchiFin/`.

## v0.4.1. Solo iPhone (13 de noviembre de 2026)

- Decisión del usuario: de momento, solo la app del iPhone con los datos en el móvil. Escritorio, Google y sincronización, para más adelante.
- Se retira la barra lateral de escritorio y las variantes para pantalla ancha: una sola columna de móvil (máximo 512 px) con la barra de pestañas flotante, también en un navegador de ordenador. Las hojas siempre suben desde abajo y los formularios van en una columna.
- Textos de la app referidos al iPhone en lugar de «este dispositivo» y sin menciones al ordenador. Resúmenes se abre desde el Extracto.

## v0.4.0. Datos solo en el dispositivo (13 de noviembre de 2026)

- Decisión del usuario: sin Supabase ni base de datos fuera del móvil. Se retiran el acceso con Google, el cliente `@supabase/supabase-js` y las pantallas de acceso y configuración. `supabase/` queda en pausa como referencia (`supabase/README.md`), fuera de las pruebas de GitHub.
- Almacén local (`src/datos/almacen.ts`): todo el modelo en un documento (`BaseDatos`) en IndexedDB (`puchifin`), cargado en memoria, guardado en cada cambio y con petición de almacenamiento persistente. `useDatos()` para las pantallas e `intentar()` para aplicar operaciones con su mensaje de error.
- Operaciones puras (`src/datos/operaciones.ts`) con las reglas que antes aplicaba Postgres: datos identificativos campo a campo, alias únicos sin series largas de dígitos, nombres de categoría únicos por nivel, dos niveles con herencia de naturaleza, fusión de categorías (con subcategorías homónimas y suma de presupuestos), ajustes, borrado en cascada de importaciones y datos de prueba, y comprobación completa (`comprobarBaseDatos`) con referencias y duplicados.
- Archivo (`src/datos/archivo.ts`): formato `{app, formato, version_app, exportado, datos}`, validación completa al importar, `VERSION_ESQUEMA` y `migrar()` para adaptar archivos antiguos. Importar y restaurar sustituyen todo y antes guardan una copia «antes de importar» o «antes de restaurar».
- Corregido: la comprobación de datos identificativos de una copia se hacía sobre el JSON entero y podía tomar un identificador interno con forma de tarjeta por un dato real. Ahora se revisan solo los campos de texto.
- Aviso de exportación pendiente en el Extracto (`src/lib/avisos.ts`) y última exportación en Herramientas.
- Pruebas: 128 tests, entre ellos exportar e importar sin ninguna diferencia, persistencia en IndexedDB (`fake-indexeddb`) y copias con restauración. Prueba en navegador real: datos creados en un iPhone simulado, exportados e importados en un escritorio con almacenamiento propio, con el contenido idéntico.

## v0.3.0. Estilo iOS y PDF para compartir (13 de noviembre de 2026)

- Iconos: catálogo propio de 50 glifos de trazo fino (`src/componentes/iconos.ts`, lucide) mostrados en baldosas de color con esquinas redondeadas (`Baldosa`), al estilo de Ajustes de iOS. Las categorías guardan la clave del icono en lugar de un emoji; un valor desconocido se muestra como etiqueta. Catálogo inicial con la paleta del sistema de iOS (migración `20261113000003` corregida antes de aplicarse en ningún proyecto). No se usan SF Symbols: su licencia los limita a apps de Apple.
- Barra de pestañas flotante y translúcida con la pestaña activa resaltada; barra lateral de escritorio al estilo de iPad y Mac; títulos grandes; fondo agrupado (#F2F2F7) y tarjetas sin borde.
- Componentes: `Interruptor` y `FilaInterruptor` (en lugar de casillas), control segmentado, botones de icono y de texto sin marco, botón secundario gris relleno. Cuentas y categorías como listas agrupadas con chevrón; la cuenta se activa o desactiva en su ficha. Editor de categoría con selector de icono en cuadrícula y colores de la paleta de iOS (más uno libre).
- Resúmenes: PDF «Para compartir» (`reducida`), con indicadores y gasto por categoría, sin subcategorías, movimientos, semanas ni gastos de empleado. La vista previa muestra lo mismo que saldrá en el PDF. La elección se recuerda en el dispositivo.

## v0.2.0. Herramientas de PuchiTask y resúmenes en PDF (13 de noviembre de 2026)

- Versiones y novedades: la versión sale de `package.json` (`__APP_VERSION__`). El service worker pasa a `registerType: 'prompt'`: la versión nueva espera hasta que se toca «Actualizar». El aviso abre la hoja «Novedades de la X» con las versiones que faltan, leídas sin caché de `public/novedades.json` (fuera del precache). En Ajustes, Herramientas: versión, Novedades y Buscar actualización. Comprobación al volver a la app.
- Registro (`src/lib/registro.ts`): `localStorage` `puchifin-registro`, 400 entradas, captura de errores, promesas rechazadas y `console.error`. Enmascara cualquier IBAN, tarjeta o DNI que llegue. Ver, Copiar, Compartir, Guardar como .txt y Borrar con Deshacer.
- Copias de seguridad (`src/lib/copias.ts`): `exportar_copia()` y `restaurar_copia(copia)` en Supabase (migración `20261113000005_copias.sql`), restauración en una sola transacción y siempre con RLS. Copia diaria en IndexedDB (`puchifin-copias`, 7 diarias y 10 del resto), copia manual, copia automática antes de restaurar, exportar a JSON e importar desde archivo con validación previa de datos identificativos.
- Datos de prueba (`src/lib/datosPrueba.ts`): generación determinista desde la fecha de inicio hasta hoy, con nómina, recibos, compras con tarjeta, devoluciones, gastos de empleado con reembolso y conciliación, liquidación de tarjeta que cuadra con el mes anterior y traspasos entre cuentas. Origen de importación `datos_prueba` (migración `20261113000004_datos_prueba.sql`): borrar esas importaciones elimina sus movimientos en cascada.
- Resúmenes (`src/lib/resumen.ts`, `src/lib/pdf.ts`, pantalla `/resumenes`): semana de lunes a domingo y mes natural; indicadores con comparación con el periodo anterior; gasto por categoría con peso y diferencia; mensual con semanas recortadas al mes y mayores gastos; semanal con todos los movimientos (los que no computan, en gris); bloque «Fuera del extracto» con gastos de empleado, reembolsos, pendiente al cierre, traspasos y deuda. Un periodo en curso se compara con los mismos días del anterior (del 1 al 13 de octubre frente al 1 al 13 de noviembre) y lo indica. PDF A4 con jsPDF en el dispositivo (carga diferida), compartir con la hoja del sistema o descargar, opción de quitar los conceptos.
- Detección de datos identificativos: el patrón de IBAN ya no absorbe la palabra siguiente (bloques posteriores al primero empiezan por dígito). Mismo cambio en Postgres y en el frontal, con casos nuevos de Francia y Países Bajos.
- Pruebas: 100 tests unitarios y pruebas de base de datos de copias y datos de prueba (`supabase/tests/20_copias.sql`). Flujo de GitHub Actions con las pruebas en cada envío.

## v0.1.0. Fase 1: base (13 de noviembre de 2026)

- Proyecto React, TypeScript, Vite, Tailwind y PWA con navegación móvil y escritorio.
- Migraciones: nueve tablas más `ajustes`, RLS en todas, acceso solo para el correo autorizado y comprobación de IBAN, tarjeta y DNI en la base de datos.
- Carga inicial de cuentas por alias, catálogo de categorías, ajustes y deuda familiar.
- Pantallas de acceso con Google, cuentas, categorías y ajustes generales.
