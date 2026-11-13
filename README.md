# PuchiFin

App web privada de finanzas personales (PWA). Especificación completa y estado del proyecto en [`CLAUDE.md`](CLAUDE.md).

App solo para el iPhone. Los datos se guardan **solo en el móvil** (IndexedDB): no hay servidor, cuenta ni base de datos externa. La copia fuera del móvil es el archivo de Ajustes, Herramientas, «Exportar todos los datos», guardado en Archivos o iCloud Drive; «Importar archivo» lo recupera todo exactamente igual. El escritorio, Google y la sincronización quedan para más adelante.

Stack: React, TypeScript, Vite, Tailwind CSS, jsPDF y Recharts. Todo gratuito.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `src/lib/tipos.ts` | Modelo de datos (`BaseDatos`) y versión del esquema |
| `src/datos/operaciones.ts` | Operaciones puras sobre los datos y sus reglas (datos identificativos, unicidad, integridad) |
| `src/datos/almacen.ts` | Almacén en IndexedDB y suscripción de las pantallas |
| `src/datos/archivo.ts` | Formato del archivo de exportación, validación y migración de esquemas |
| `src/importacion/` | Importación de los Excel de BBVA: plantillas (`plantillas/*.json`), lectura, anonimización, reglas, deduplicación y Excel de prueba |
| `src/datos/movimientos.ts` | Corrección de categorías, tipos, gastos de empleado y conciliación de reembolsos |
| `src/lib/extracto.ts` | Extracto mensual y vistas de análisis |
| `src/componentes/gestos.tsx` | Gestos con el pulgar: filas deslizables, cambiar de mes, volver desde el borde |
| `src/lib/identificativos.ts` | Detección de IBAN, cuenta, tarjeta, DNI y NIE |
| `src/lib/resumen.ts`, `src/lib/pdf.ts` | Resúmenes semanal y mensual y su PDF |
| `src/lib/copias.ts` | Copias de seguridad, exportar e importar |
| `src/lib/datosPrueba.ts` | Generador de datos de prueba |
| `src/lib/registro.ts` | Registro de errores y eventos para pegar en el chat |
| `src/lib/version.ts`, `public/novedades.json` | Versión y novedades que se muestran al actualizar |
| `src/componentes/` | Estructura, estilo iOS (baldosas, interruptores, hojas) y aviso de actualización |
| `tests/fixtures/` | Datos sintéticos para los tests. Nunca datos reales |
| `datos_locales/` | Excel reales de BBVA. Fuera del repositorio (`.gitignore`) |
| `supabase/` | En pausa: migraciones de la primera versión, como referencia |

## En local

```bash
npm install
npm run dev
```

## Publicar

La app está en **https://cullera33-puchi.github.io/PuchiFin/**. Cada envío a `main` la publica con GitHub Pages (`.github/workflows/publicar.yml`): tests, build con `BASE_PATH=/PuchiFin/`, `404.html` para los enlaces directos y publicación. Requisito, una sola vez: en el repositorio, Settings, Pages, Source: GitHub Actions.

En el iPhone: abrir la dirección en Safari, Compartir, «Añadir a pantalla de inicio». Los datos dependen de esa dirección: si cambia, se exportan en la antigua y se importan en la nueva.

### Nueva versión

1. Subir `version` en `package.json`.
2. Añadir la entrada técnica en `CHANGELOG.md` y de 3 a 5 líneas para el usuario en `public/novedades.json`.
3. Si cambia el modelo de datos, subir `VERSION_ESQUEMA` y añadir la adaptación en `migrar()`.
4. Publicar. En los dispositivos sale «Nueva versión disponible» con las novedades.

## Pruebas

```bash
npm test        # tests unitarios (Vitest): operaciones, archivo, almacén, resúmenes, PDF, copias…
npm run build   # comprobación de tipos y build de producción
npm run excel:prueba   # regenera los Excel de prueba con formato BBVA en tests/fixtures/
```

GitHub Actions ejecuta las dos en cada envío (`.github/workflows/pruebas.yml`). Los iconos de la PWA se regeneran desde `public/favicon.svg` con `node scripts/generar-iconos.mjs` (usa Playwright).
