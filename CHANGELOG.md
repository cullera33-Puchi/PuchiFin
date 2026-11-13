# Registro de cambios

Lo entregado en cada versión, con detalle técnico. Las líneas para el usuario van en `public/novedades.json`.

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
