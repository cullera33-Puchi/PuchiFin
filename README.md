# PuchiFin

App web privada de finanzas personales (PWA). Especificación completa y estado del proyecto en [`CLAUDE.md`](CLAUDE.md).

Stack: React, TypeScript, Vite, Tailwind CSS, Supabase (Postgres, Auth con Google, RLS), Recharts y SheetJS. Todo en servicios gratuitos.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `src/lib/identificativos.ts` | Detección de IBAN, cuenta, tarjeta, DNI y NIE (verificación final antes de guardar) |
| `src/lib/formato.ts` | Importes y fechas en formato español |
| `src/lib/resumen.ts`, `src/lib/pdf.ts` | Resúmenes semanal y mensual y su PDF |
| `src/lib/copias.ts` | Copias de seguridad (dispositivo, archivo y restauración) |
| `src/lib/datosPrueba.ts` | Generador de datos de prueba |
| `src/lib/registro.ts` | Registro de errores y eventos para pegar en el chat |
| `src/lib/version.ts`, `public/novedades.json` | Versión y novedades que se muestran al actualizar |
| `src/sesion/` | Sesión con Google y carga inicial de datos |
| `src/paginas/` | Extracto, Movimientos, Empleado y Ajustes (cuentas, categorías y general) |
| `supabase/migrations/` | Modelo de datos, seguridad (RLS y correo autorizado) y datos iniciales |
| `supabase/tests/` | Pruebas de las migraciones contra un Postgres local |
| `tests/fixtures/` | Datos sintéticos para los tests. Nunca datos reales |
| `datos_locales/` | Excel reales de BBVA. Fuera del repositorio (`.gitignore`) |

## Puesta en marcha

### 1. Proyecto Supabase

1. Crear un proyecto gratuito en supabase.com (región UE).
2. Aplicar las migraciones de `supabase/migrations/` en orden: con la CLI (`supabase link` y `supabase db push`) o pegándolas en el editor SQL.
3. Dar de alta el único correo autorizado desde el editor SQL. El correo no se guarda en el repositorio:

   ```sql
   insert into privado.correos_autorizados (correo) values ('tu.correo@gmail.com');
   ```

   Cualquier otra cuenta de Google que intente entrar se rechaza en la base de datos.

### 2. Acceso con Google

1. En Google Cloud Console, crear un cliente OAuth de tipo "Aplicación web" con este URI de redirección: `https://<ref-del-proyecto>.supabase.co/auth/v1/callback`.
2. En Supabase, Authentication, Providers, Google: activar y pegar el ID y el secreto del cliente.
3. En Authentication, URL Configuration: Site URL con la URL de producción y, en Redirect URLs, también `http://localhost:5173`.
4. Tras el primer acceso correcto, en Authentication, Sign In / Providers: desactivar "Allow new users to sign up". La cuenta ya creada sigue entrando con normalidad.

### 3. Frontal en local

```bash
cp .env.example .env.local   # URL del proyecto y clave pública (nunca la de servicio)
npm install
npm run dev
```

### 4. Despliegue en Vercel

Importar el repositorio en Vercel (plan gratuito), añadir `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` como variables de entorno y desplegar. `vercel.json` ya incluye la reescritura de rutas y las cabeceras de seguridad. En el iPhone, abrir la URL en Safari y "Añadir a pantalla de inicio".

## Publicar una versión

1. Subir `version` en `package.json`.
2. Añadir la entrada técnica en `CHANGELOG.md` y de 3 a 5 líneas para el usuario en `public/novedades.json`.
3. Si cambian las migraciones, aplicarlas en Supabase antes de desplegar.
4. Enviar a la rama de producción. En los dispositivos sale «Nueva versión disponible» con las novedades.

## Pruebas

```bash
npm test          # tests unitarios (Vitest): detección de datos, resúmenes, PDF, copias, registro…
npm run test:db   # migraciones y RLS contra un Postgres local desechable
npm run build     # comprobación de tipos y build de producción
```

`npm run test:db` necesita los binarios de Postgres instalados (busca en `/usr/lib/postgresql/*/bin` o en `PGBIN`). Simula lo mínimo de Supabase (esquema `auth` y roles) y comprueba el acceso por correo autorizado, la carga inicial, el rechazo de datos identificativos, la deduplicación, la fusión de categorías el aislamiento por RLS, los datos de prueba y la exportación y restauración de copias. También verifica que la base de datos y el frontal detectan exactamente los mismos casos de `tests/fixtures/casos_identificativos.json`.

GitHub Actions ejecuta las tres en cada envío (`.github/workflows/pruebas.yml`).

Los iconos de la PWA se regeneran desde `public/favicon.svg` con `node scripts/generar-iconos.mjs` (usa Playwright).
