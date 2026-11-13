-- PuchiFin v0.2.0: origen propio para los datos de prueba.
-- Los movimientos de prueba cuelgan de importaciones con este origen, así que
-- borrar esas importaciones los elimina por completo (on delete cascade).
alter type public.origen_importacion add value if not exists 'datos_prueba';
