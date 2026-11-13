# Supabase: en pausa

Desde la v0.4.0 (13 de noviembre de 2026), PuchiFin guarda los datos solo en el dispositivo y los
pasa entre el iPhone y el ordenador con un archivo JSON (Ajustes, Herramientas). No se usa ninguna
base de datos fuera del móvil.

Estas migraciones y pruebas (`npm run test:db`) se conservan como referencia del modelo por si más
adelante se decide sincronizar con Supabase. No se mantienen al día con el modelo local
(`src/lib/tipos.ts`) ni se ejecutan en GitHub. Antes de retomarlas, hay que actualizarlas.
