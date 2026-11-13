# App de finanzas personales: instrucciones y especificación para Claude Code

Versión del 13 de noviembre de 2026.

**Primera tarea:** guarda este documento completo como `CLAUDE.md` en la raíz del repositorio. Después, crea la estructura del proyecto y empieza por la fase 1. No avances a la siguiente fase sin mi validación.

# Parte 1. Instrucciones

## Qué es

App web privada de finanzas personales para un único usuario. Sustituye a Fintonic: importa los extractos de BBVA en Excel, categoriza los movimientos, excluye los gastos de empleado y muestra un extracto mensual con el gasto real. Se usa en iPhone y en escritorio.

La especificación funcional completa está en la segunda parte de este documento. Léela entera antes de empezar cualquier fase.

## Stack

- Frontal: React, TypeScript y Vite. PWA instalable en el iPhone, responsive, una sola base de código para móvil y escritorio.
- Estilos: Tailwind CSS. Tema claro y oscuro según el sistema.
- Lectura de Excel: SheetJS, siempre en el navegador.
- Backend: Supabase (Postgres, Auth con proveedor Google, Row Level Security).
- Gráficos: Recharts.
- Despliegue: gratuito (Vercel o GitHub Pages).
- Todos los servicios deben ser gratuitos. No usar la API de Anthropic ni ningún servicio de pago.

## Reglas que no se pueden saltar

1. Ningún número de cuenta, IBAN, número de tarjeta ni DNI se guarda en Supabase ni en el repositorio. La anonimización se hace en el navegador antes de enviar nada.
2. Los ficheros originales nunca se suben a Supabase ni se guardan en el repositorio.
3. Antes de confirmar una importación, verificación final de lo que se va a guardar con patrones de IBAN, tarjeta y DNI. Si encuentra alguno, bloquea la importación y muestra la línea afectada.
4. Row Level Security activo en todas las tablas. Registro de nuevos usuarios desactivado en Supabase Auth. La clave de servicio nunca va en el frontal.
5. Solo los movimientos de tipo Normal computan en el extracto, el presupuesto y los totales.
6. Importes en euros con signo: negativo es gasto, positivo es ingreso. En pantalla, formato español (1.234,56 €).
7. Interfaz en español.

## Datos de prueba

- Los Excel reales de BBVA se dejan en `datos_locales/`, que va en `.gitignore`. Nunca se suben al repositorio.
- Para los tests, crear ficheros sintéticos en `tests/fixtures/` con las mismas columnas y datos inventados.

## Alcance de esta primera versión

Fases 1 a 3 de la hoja de ruta. Las fases 4 a 6 quedan fuera hasta nueva indicación, pero el modelo de datos se crea completo desde la fase 1.

### Fase 1. Base

- Proyecto Supabase con todas las tablas del modelo de datos, incluidas compromisos y eventos previstos. Migraciones versionadas en `supabase/migrations/`.
- Acceso con Google restringido a una sola cuenta.
- Alta de cuentas por alias, sin números: Cuenta principal, Cuenta 2, Tarjeta e Hipoteca.
- Catálogo predeterminado de categorías cargado como datos iniciales.
- Se cierra cuando el acceso, el modelo y el catálogo están operativos.

### Fase 2. Importación BBVA

- Lector de Excel de cuenta y de tarjeta. El mapeo de columnas va en un fichero de configuración por origen, no en el código.
- Anonimización, normalización, deduplicación, fecha de inicio 1 de octubre de 2026, reglas de categorización, traspasos internos y pantalla de revisión.
- Opción de deshacer una importación completa.
- Se cierra cuando octubre y noviembre están importados sin duplicados, sin datos identificativos y sin doble cómputo de la tarjeta.

### Fase 3. Extracto y gastos de empleado

- Extracto mensual, lista de movimientos con búsqueda y filtros, corrección de categorías individual y en bloque.
- Marcado rápido de gastos de empleado: deslizar en móvil, selección múltiple y atajo de teclado en escritorio.
- Conciliación de reembolsos y vista de gastos de empleado.
- Exportación a Excel de cualquier vista.
- Se cierra cuando octubre y noviembre están cerrados con los reembolsos conciliados.

### Herramientas comunes (traídas de PuchiTask, v0.2.0)

Se mantienen en todas las fases. Están en Ajustes, Herramientas.

- **Versiones y novedades.** Cada versión publicada sube `version` en `package.json`, añade su entrada técnica a `CHANGELOG.md` y de 3 a 5 líneas para el usuario en `public/novedades.json` (la más reciente arriba, campos `version`, `fecha` y `cambios`). Sin ese cambio, los dispositivos no ven las novedades. Al detectar una versión nueva, la app avisa «Nueva versión disponible» y «Actualizar» muestra las novedades que faltan antes de aplicarla.
- **Registro.** `registrar()` de `src/lib/registro.ts` anota errores y eventos en el dispositivo (400 entradas) para copiarlo al chat. Toda operación nueva relevante (importación, copia, restauración, PDF, errores de Supabase) se registra. Nunca conceptos, importes ni nombres: solo recuentos e identificadores internos. Si se cuela un IBAN, tarjeta o DNI, se enmascara.
- **Copias de seguridad.** Copia diaria en el dispositivo (IndexedDB, 7 últimas), copia manual, exportar a archivo JSON y restaurar desde una copia local o un archivo. Restaurar sustituye todo en una sola transacción y antes guarda una copia del estado actual. Si cambia el modelo de datos, subir `esquema` en `exportar_copia()` y en `restaurar_copia()`.
- **Datos de prueba.** Movimientos inventados desde la fecha de inicio hasta hoy, colgados de importaciones con origen `datos_prueba`: se eliminan de una vez sin tocar lo real. El extracto, los resúmenes y el PDF avisan cuando hay datos de prueba. Si se añaden reglas o tipos nuevos, el generador debe cubrirlos.
- **Estilo iOS (v0.3.0).** Iconos de trazo fino; los de categorías y cuentas, en baldosas de color (`Baldosa`) con el catálogo de `src/componentes/iconos.ts`. Nada de emojis como iconos. Paleta del sistema de iOS, interruptores en lugar de casillas, controles segmentados, listas agrupadas con chevrón y botones de texto o de icono sin marco. Toda pantalla nueva sigue este estilo.
- **Pruebas en GitHub.** `.github/workflows/pruebas.yml` ejecuta tests, build y pruebas de base de datos en cada envío.

### Resúmenes en PDF (adelantado a petición del usuario, v0.2.0)

Resumen semanal y mensual, con vista previa en pantalla y PDF para compartir (por ejemplo, con alguien de la familia que no tiene acceso a la app). Especificación en el apartado 8 bis de la segunda parte. El contenido se ajusta con el uso.

## Cómo trabajar

- Una fase cada vez. Al terminar cada fase, resume qué se ha hecho, qué queda pendiente y cómo probarlo.
- Tests unitarios para el lector de Excel, la anonimización, la deduplicación y las reglas de categorización. Es donde un error no se ve en pantalla.
- Si una decisión no está en la especificación, pregunta antes de asumir.
- Mantén actualizado el apartado de estado de este fichero.

## Pendiente de confirmar

- Columnas exactas de los Excel de BBVA, de cuenta y de tarjeta. Hasta tenerlas, el lector se construye contra el mapeo configurable y los ficheros sintéticos.
- Ordenante y concepto de la transferencia de reembolso de la empresa.
- Si la deuda familiar tiene intereses y si el colchón se mide sobre el saldo conjunto de las dos cuentas (afecta a la fase 4).
- Entidad de cada cuenta y cuenta desde la que se paga la hipoteca.
- El repositorio es público. No contiene datos personales, pero para una app de finanzas conviene hacerlo privado (Vercel funciona igual). el usuario lo deja pendiente.
- Dónde se guarda el nombre del familiar que se sustituye por «Familia» (fase 2): en `ajustes` de Supabase o solo en el navegador de cada dispositivo.

## Estado

- Fase 0: diseño funcional cerrado. Faltan los Excel reales de BBVA para fijar el mapeo de columnas.
- Fase 1 (13/11/2026): primera versión construida, pendiente de validación.
  - Proyecto React, TypeScript y Vite con Tailwind, PWA instalable y navegación móvil (barra inferior) y escritorio (menú lateral).
  - Migraciones en `supabase/migrations/`: las nueve tablas más `ajustes`, RLS en todas, lista de correos autorizados que bloquea el alta de cualquier otra cuenta, comprobación en base de datos de IBAN, tarjeta y DNI en los textos, y función de carga inicial del catálogo de categorías, ajustes y compromiso de deuda.
  - Pantallas: acceso con Google, alta y edición de cuentas por alias, catálogo de categorías editable y ajustes generales. Extracto, Movimientos y Empleado quedan como marcadores de las fases 2 y 3.
  - Tests: detección de datos identificativos, formato de importes y validación de alias.
  - Pendiente: crear el proyecto Supabase, aplicar las migraciones, configurar el proveedor Google y dar de alta el correo autorizado (pasos en `README.md`).
- v0.2.0 (13/11/2026): herramientas de PuchiTask (versiones y novedades, registro, copias de seguridad y datos de prueba) y resúmenes semanal y mensual en PDF. Detalle en `CHANGELOG.md`. Pendiente de validar por el usuario, igual que la fase 1.
- v0.3.0 (13/11/2026): estilo iOS (iconos en baldosas, barra de pestañas flotante, interruptores, listas agrupadas) y PDF reducido para compartir, ambos pedidos por el usuario.

# Parte 2. Especificación funcional

## 1. Objetivo y alcance

App web privada que sustituye a Fintonic. Importa los movimientos de BBVA (dos cuentas y una tarjeta de crédito) desde octubre de 2026, los categoriza y muestra un extracto mensual con el gasto real, sin los gastos de empleado. Uso personal, un solo usuario, en móvil y escritorio.

**Dentro de la v1**

- Punto de partida en octubre de 2026: se importan octubre y noviembre de BBVA.
- Importación periódica de los Excel de BBVA, cuenta y tarjeta por separado.
- Categorías predeterminadas ampliables, categorización automática por reglas y corrección manual.
- Gastos de empleado y sus reembolsos, que se marcan rápido y no computan.
- Extracto mensual, evolución por categoría, presupuesto mensual por categoría y plan de pagos de la deuda familiar.

**Fuera de la v1**

- Carga del histórico de Fintonic (fase 5) e importación de PDF.
- Conexión directa con el banco (PSD2): exige un agregador de pago y no aporta frente a la carga manual mensual.
- Análisis predictivo, que entra por fases según la hoja de ruta.
- Otras entidades bancarias, aunque el importador queda preparado para añadir formatos.

## 2. Arquitectura, acceso y seguridad

Frontal web responsive y Supabase como backend, con acceso mediante la cuenta de Google. Todo lo guardado está cifrado y anonimizado: ningún número de cuenta ni de tarjeta llega a Supabase.

| Capa | Decisión |
| --- | --- |
| Frontal | App web responsive (PWA instalable en el iPhone), una sola base de código para móvil y escritorio |
| Backend | Supabase: Postgres. El procesado de las importaciones se hace en el navegador, antes de enviar nada |
| Acceso | Supabase Auth con proveedor Google, restringido a una sola cuenta |
| Autorización | Row Level Security en todas las tablas: cada fila ligada al usuario |
| Cifrado | Estándar de Supabase sobre todas las tablas: en reposo (disco y copias) y en tránsito (TLS) |
| Ficheros originales | No se guardan. Se leen en el dispositivo, se anonimizan y se descartan |

**Medidas adicionales sin coste**

- Registro de nuevos usuarios desactivado en Supabase Auth: solo entra la cuenta autorizada.
- La clave de servicio nunca va en el frontal; solo la clave pública con RLS.
- Exportación completa a Excel desde la app, como copia propia fuera de Supabase.
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

La v1 solo importa de BBVA. Fintonic entra en la fase 5. Cada origen tiene su plantilla de lectura, y la app reconoce el origen por las cabeceras del fichero sin pedir que se elija.

| Origen | Formato | Uso |
| --- | --- | --- |
| BBVA cuenta | Excel desde bbva.es | Importación periódica (dos cuentas) |
| BBVA tarjeta de crédito | Excel desde bbva.es | Importación periódica |
| Fintonic | Excel exportado | Fase 5: carga del histórico hasta septiembre de 2026, una sola vez |

**Flujo de importación**

1. Subida del fichero desde el móvil o el escritorio (arrastrar o seleccionar).
2. Detección del origen y lectura: limpieza de cabeceras, filas de saldo y totales.
3. Anonimización según el apartado anterior.
4. Normalización: fecha, importe con signo, concepto limpio, saldo tras la operación y cuenta de origen.
5. Deduplicación contra lo ya cargado.
6. Categorización automática por reglas y sugerencia de gastos de empleado.
7. Pantalla de revisión: nuevos, duplicados descartados, sin categoría y candidatos a gasto de empleado. Se confirma o se ajusta en bloque.
8. Verificación final de datos identificativos.
9. Confirmación y registro de la importación (fecha, origen, número de movimientos), con opción de deshacerla completa.

**Deduplicación**

- Clave de cada movimiento: cuenta, fecha de operación, importe y concepto normalizado.
- Si dos movimientos legítimos coinciden en todo (dos cafés iguales el mismo día), se conserva el número de repeticiones del fichero.
- Un fichero que se solapa con otro ya importado solo añade lo que falta.

**Fecha de inicio y corte con Fintonic**

- La app empieza el 1 de octubre de 2026. Los movimientos de BBVA anteriores se descartan al importar.
- Cuando se cargue Fintonic, aportará solo hasta el 30 de septiembre de 2026, sin solape con BBVA.
- La fecha de corte se guarda en ajustes y se puede mover.

**Plantillas de lectura**

Las columnas exactas se fijan con los Excel reales de BBVA (cuenta y tarjeta). El mapeo va en un fichero de configuración por origen para poder ajustarlo sin tocar el código.

## 4. Modelo de datos

Nueve tablas en Supabase. El movimiento es la unidad central y lleva un tipo que decide si computa en el extracto.

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

Los ajustes generales (fecha de inicio, fecha de corte con Fintonic, lista de alias de terceros, umbrales) van en una tabla `ajustes` de una sola fila o en columnas del perfil de usuario.

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

- Catálogo predeterminado de gasto e ingreso (tabla inferior). Cuando se cargue el histórico (fase 5), cada categoría de Fintonic se asigna a una del catálogo mediante una tabla de equivalencias.
- Se pueden crear categorías y subcategorías nuevas, con icono y color, y renombrar, fusionar o desactivar las existentes. Los movimientos asociados se reasignan.

| Categoría | Subcategorías predeterminadas |
| --- | --- |
| Vivienda | Hipoteca, comunidad, IBI y tasas, seguro de hogar, mantenimiento y reformas |
| Suministros | Luz, agua, fibra y móvil |
| Alimentación | Supermercado, mercado y tiendas |
| Restaurantes y ocio | Restaurantes, cafeterías, ocio, cultura |
| Transporte | Combustible, peajes, aparcamiento, transporte público, mantenimiento del coche |
| Hijos | Colegio, extraescolares, ropa, cuidado |
| Salud | Farmacia, seguro médico, consultas |
| Compras | Ropa, hogar, tecnología, regalos |
| Suscripciones | Plataformas, software, cuotas |
| Viajes | Alojamiento, transporte, actividades |
| Seguros | Coche, vida, otros |
| Comisiones e intereses | Comisiones bancarias, intereses de tarjeta |
| Impuestos | IRPF, otros |
| Ingresos | Nómina, otros ingresos |

**Orden de aplicación en cada importación**

1. Reglas manuales, por prioridad.
2. Reglas aprendidas: si un concepto limpio ya se categorizó antes, se repite la categoría.
3. Sin coincidencia: el movimiento queda sin categoría y aparece en la revisión.

**Corrección manual**

- Desde el detalle de un movimiento o en bloque, seleccionando varios.
- Al corregir, la app pregunta si aplicar el cambio a todos los movimientos con el mismo concepto y si crear la regla para los futuros.
- Bandeja de movimientos sin categoría siempre visible con su contador.

**Más adelante:** sugerencia de categoría para conceptos nuevos por similitud con los ya categorizados, calculada en la propia app y sin coste.

## 6. Gastos de empleado y reembolsos

Los gastos de trabajo pagados con la tarjeta y su reembolso por transferencia aparte quedan fuera del extracto, y la app controla lo pendiente de cobrar.

**Marcado rápido**

- En la lista de movimientos, deslizar a la izquierda marca el gasto como de empleado. En escritorio, atajo de teclado y selección múltiple.
- En la revisión de cada importación aparece un bloque de posibles gastos de empleado para confirmar o descartar de una vez.
- El gasto conserva su categoría (Viajes, Restaurantes) para analizar lo adelantado por tipo.

**Sugerencias automáticas**

- Reglas iniciales que se ajustan con el uso: hoteles, Renfe, aerolíneas, taxis y VTC, restaurantes en día laborable fuera de la zona de casa (configurable).
- Toda sugerencia requiere confirmación; nada se excluye sin pasar por el usuario.
- Cada confirmación o descarte refuerza o debilita la regla.

**Reembolsos**

- La transferencia de la empresa se identifica por el ordenante y el concepto, y se marca como reembolso con una regla fija.
- Al marcarla, la app propone los gastos de empleado pendientes que suman ese importe, del más antiguo al más reciente.
- Si no cuadra exacto, se vinculan manualmente y la diferencia queda visible (gasto no reembolsado o reembolso de más).

**Vista de gastos de empleado**

| Indicador | Cálculo |
| --- | --- |
| Pendiente de reembolso | Gastos de empleado sin vincular a un reembolso |
| Antigüedad | Días desde el gasto pendiente más antiguo |
| Reembolsado en el año | Suma de reembolsos del año natural |
| Diferencias | Gastos cerrados con reembolso parcial o sin reembolso |

Un gasto pendiente más de 60 días (umbral configurable) se destaca en la vista.

## 7. Tarjeta de crédito y traspasos internos

El gasto se computa en el movimiento de la tarjeta, no en el cargo mensual de la liquidación en la cuenta, que se marca como traspaso interno.

- **Liquidación de la tarjeta:** regla fija sobre el concepto del cargo en cuenta. La app comprueba que el importe cuadra con los movimientos del periodo de la tarjeta y avisa si hay diferencia.
- **Cuotas de pago aplazado:** los intereses y comisiones sí computan (Comisiones e intereses); el principal ya se contó en la compra.
- **Movimientos entre cuentas propias:** cualquier transferencia entre dos cuentas dadas de alta se marca como traspaso interno en ambos lados.
- **Devoluciones en tarjeta:** se registran con importe positivo en la categoría de la compra y restan gasto.
- **Histórico de Fintonic (fase 5):** verificar si Fintonic ya excluía las liquidaciones. Si no, se aplica la misma regla al cargarlo.

## 8. Extracto mensual y vistas

El extracto mensual es la pantalla de inicio y solo cuenta movimientos de tipo Normal.

**Extracto mensual**

- Cabecera: ingresos, gastos, ahorro del mes y tasa de ahorro, con la variación frente a la media de los meses anteriores disponibles, hasta un máximo de 12.
- Desglose por categoría con importe, peso sobre el gasto total y comparativa con la media.
- Al tocar una categoría se abren sus movimientos del mes.
- Aviso visible si hay movimientos sin categoría o gastos de empleado pendientes.
- Navegación mes a mes con gesto lateral.

**Vistas de análisis**

| Vista | Contenido |
| --- | --- |
| Evolución | Ingresos, gastos y ahorro por mes en todo el histórico |
| Categorías | Evolución de una categoría concreta y su media móvil |
| Anual | Cierre por año natural y comparativa entre años |
| Movimientos | Lista completa con búsqueda y filtros por cuenta, categoría, tipo e importe |
| Gastos de empleado | La vista descrita en el apartado 6 |

**Exportación:** cualquier vista se exporta a Excel con los movimientos que la componen.

## 8 bis. Resúmenes semanal y mensual en PDF (v0.2.0)

Pantalla Resúmenes (en el móvil, desde el Extracto; en escritorio, en el menú lateral). Se elige semanal o mensual, se navega por periodos y se genera el PDF para compartir con la hoja de compartir del iPhone o descargarlo. Todo se calcula y se genera en el dispositivo.

- **Periodos:** semana de lunes a domingo y mes natural. La comparativa es siempre con el periodo anterior (semana anterior o mes anterior). Si el periodo está en curso, se compara con los mismos días del anterior y se indica en pantalla y en el PDF.
- **Cálculo:** solo computan los movimientos de tipo Normal. En una categoría de gasto, una devolución resta gasto; sin categoría, se clasifica por el signo.
- **Contenido común:** ingresos, gastos, ahorro y tasa de ahorro con su variación; gasto por categoría con peso, importe del periodo anterior y diferencia; bloque «Fuera del extracto» con gastos de empleado, reembolsos, pendiente de reembolso al cierre, traspasos y pagos de deuda.
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
| Intereses | Sin intereses (pendiente de confirmar) |
| Colchón de ahorro | Importe que se introduce en la app, sobre el saldo conjunto de las dos cuentas (pendiente de confirmar) |
| Ventana de pago | Junio a agosto, con julio como mes de referencia para la proyección |
| Importe del pago | Todo el saldo que supere el colchón en la fecha de pago |

**Registro de los pagos**

- Las transferencias al familiar se identifican por regla y se marcan con el tipo Pago de deuda. No computan como gasto y reducen la deuda pendiente.
- En el concepto, el nombre del familiar se sustituye por el alias Familia.
- Se pueden registrar pagos fuera de la ventana si algún año se adelanta una parte.

**Proyección del ahorro**

1. Saldo de partida: saldo conjunto de las dos cuentas, menos lo pendiente de liquidar en la tarjeta.
2. Más los gastos de empleado pendientes de reembolso, que son dinero adelantado que volverá.
3. Más los ingresos previstos de cada mes: media de nóminas y pagas extra en su mes.
4. Menos los gastos previstos: presupuesto por categoría o, si no lo hay, la media de la categoría.
5. Menos los gastos puntuales conocidos, registrados como eventos previstos (IBI, seguros anuales, vacaciones, colegio).
6. Resultado en el mes de pago: saldo proyectado menos el colchón, igual al pago previsto.

**Qué muestra la app**

- **Tarjeta en el extracto mensual:** deuda pendiente, pago previsto del próximo verano y cuánto ha sumado o restado el mes cerrado a ese pago, comparando el ahorro real con el previsto.
- **Calendario de pagos:** un año por fila con el pago previsto, la deuda pendiente tras el pago y el año en que queda saldada.
- **Simulación:** efecto en el pago y en el año de liquidación de ahorrar una cantidad distinta cada mes o recortar una categoría concreta.
- **Seguimiento anual:** después de cada pago, la app compara lo previsto con lo transferido y recalcula el calendario.

**Datos que necesita:** el saldo de las cuentas en cada importación (columna de saldo del Excel de BBVA, a confirmar) y los eventos previstos del año.

## 11. Exportación a Claude (fase 4)

Sin coste: la app no usa la API de Anthropic. Abre Claude con los datos ya preparados y el análisis se hace dentro de la suscripción del usuario.

- **Botón Analizar con Claude** en el extracto mensual, en cada categoría, en presupuestos, en el plan de pagos y en la vista anual.
- **Resumen por enlace:** abre claude.ai con el prompt ya escrito y el resumen del periodo (totales por categoría, presupuesto y comparativa con la media). Comprobar que el prellenado por enlace sigue disponible. La longitud del enlace limita el volumen, así que no lleva el detalle de movimientos.
- **Detalle completo:** genera un CSV con los movimientos del periodo y lo envía a la app de Claude con la hoja de compartir de iOS (Web Share API). En escritorio, descarga el CSV y copia el prompt al portapapeles.
- **Plantillas de prompt** editables en ajustes: análisis del mes, desviaciones de presupuesto, gastos recurrentes y suscripciones, comparativa interanual, plan de pagos.
- **Datos que salen:** solo los del periodo elegido, ya anonimizados. Opción en ajustes para quitar los conceptos y enviar solo categorías e importes.

## 12. Experiencia en móvil y escritorio

El móvil es para consultar y marcar rápido; el escritorio, para importar, revisar en bloque y analizar.

| Función | Móvil | Escritorio |
| --- | --- | --- |
| Extracto mensual | Pantalla de inicio, una columna | Extracto y gráfico de evolución en paralelo |
| Marcar gasto de empleado | Deslizar sobre el movimiento | Selección múltiple y atajo de teclado |
| Importar | Desde Archivos o la hoja de compartir de iOS | Arrastrar el fichero |
| Revisión de importación | Tarjetas por bloque | Tabla editable |
| Categorizar | Detalle del movimiento | Edición en línea en la tabla |

Navegación en móvil con barra inferior de cuatro pestañas: Extracto, Movimientos, Empleado y Ajustes. En escritorio, menú lateral con las mismas secciones y las vistas de análisis. Tema claro y oscuro según el sistema.

## 13. Hoja de ruta

La v1 trabaja solo con BBVA desde octubre de 2026 y queda completa al cerrar la fase 4. El histórico de Fintonic y el análisis predictivo entran en la fase 5. Todo se calcula en la propia app, sin servicios de pago.

| Fase | Contenido | Se cierra cuando |
| --- | --- | --- |
| 0. Preparación | Excel de octubre de las cuentas y la tarjeta de BBVA, plantillas de lectura, repositorio en GitHub y CLAUDE.md | El mapeo de BBVA está cerrado |
| 1. Base | Supabase, acceso con Google, modelo de datos, cuentas por alias y catálogo de categorías | Acceso, modelo y catálogo operativos |
| 2. Importación BBVA | Cuentas y tarjeta, anonimización, deduplicación, reglas, revisión y traspasos internos | Octubre y noviembre importados sin duplicados, sin datos identificativos y sin doble cómputo de la tarjeta |
| 3. Extracto y gastos de empleado | Extracto mensual, marcado rápido, conciliación de reembolsos y vistas de análisis | Octubre y noviembre cerrados con los reembolsos conciliados |
| 4. Presupuestos, plan de pagos y Claude | Presupuesto por categoría, plan de pagos de la deuda familiar con proyección y simulación, y botón Analizar con Claude | Presupuesto de diciembre definido, pago del verano de 2027 proyectado y primer análisis hecho en Claude |
| 5. Histórico y análisis predictivo | Carga de Fintonic hasta septiembre de 2026 y marcado a posteriori de gastos de empleado. Proyección de cierre de mes, gastos recurrentes (suscripciones, seguros, IBI), previsión de gastos anuales por estacionalidad y alerta de gastos atípicos | Histórico cargado sin solapes y previsiones contrastadas con el real de tres meses |
| 6. Mejoras | Importación de PDF, Face ID, sugerencia de categoría por similitud, notificaciones, otras entidades | Según uso |

## 14. Decisiones abiertas

- [ ] Compartir los Excel de octubre de las dos cuentas y de la tarjeta de BBVA para fijar las plantillas de lectura.
- [ ] Confirmar el ordenante y el concepto con los que llega la transferencia de reembolso.
- [ ] Confirmar si la deuda familiar tiene intereses y si el colchón se mide sobre el saldo conjunto.
- [ ] Recuperar el Excel de Fintonic antes de la fase 5.
- [ ] Confirmar la entidad de cada cuenta y de la hipoteca, y desde qué cuenta se paga la cuota.
- [ ] Comprobar que claude.ai sigue admitiendo el prompt prellenado por enlace.
