# PuchiFin

App web privada de finanzas personales (PWA). Especificación completa y estado del proyecto en [`CLAUDE.md`](CLAUDE.md).

Los datos se guardan **solo en el dispositivo** (IndexedDB). No hay servidor, cuenta ni base de datos externa. Para pasar los datos del iPhone al ordenador, o al revés: Ajustes, Herramientas, «Exportar todos los datos», guardar el archivo en Archivos o iCloud Drive y, en el otro dispositivo, «Importar archivo». Queda todo exactamente igual.

Stack: React, TypeScript, Vite, Tailwind CSS, jsPDF y Recharts. Todo gratuito.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `src/lib/tipos.ts` | Modelo de datos (`BaseDatos`) y versión del esquema |
| `src/datos/operaciones.ts` | Operaciones puras sobre los datos y sus reglas (datos identificativos, unicidad, integridad) |
| `src/datos/almacen.ts` | Almacén en IndexedDB y suscripción de las pantallas |
| `src/datos/archivo.ts` | Formato del archivo de exportación, validación y migración de esquemas |
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

La app es estática: Vercel (plan gratuito) con `vercel.json`, que ya incluye la reescritura de rutas y cabeceras de seguridad. No necesita variables de entorno. En el iPhone, abrir la URL en Safari y «Añadir a pantalla de inicio».

Los datos dependen de la dirección de la app: si cambia el dominio, se exportan en el antiguo y se importan en el nuevo.

### Nueva versión

1. Subir `version` en `package.json`.
2. Añadir la entrada técnica en `CHANGELOG.md` y de 3 a 5 líneas para el usuario en `public/novedades.json`.
3. Si cambia el modelo de datos, subir `VERSION_ESQUEMA` y añadir la adaptación en `migrar()`.
4. Publicar. En los dispositivos sale «Nueva versión disponible» con las novedades.

## Pruebas

```bash
npm test        # tests unitarios (Vitest): operaciones, archivo, almacén, resúmenes, PDF, copias…
npm run build   # comprobación de tipos y build de producción
```

GitHub Actions ejecuta las dos en cada envío (`.github/workflows/pruebas.yml`). Los iconos de la PWA se regeneran desde `public/favicon.svg` con `node scripts/generar-iconos.mjs` (usa Playwright).
