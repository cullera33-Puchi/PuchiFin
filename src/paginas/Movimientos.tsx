import { Encabezado, Proximamente } from '../componentes/Encabezado'

export function Movimientos() {
  return (
    <>
      <Encabezado titulo="Movimientos" subtitulo="Lista completa con búsqueda y filtros" />
      <div className="space-y-4">
        <Proximamente fase={2}>
          Importación de los Excel de BBVA (cuentas y tarjeta) con anonimización en el dispositivo, deduplicación,
          reglas de categorización y pantalla de revisión.
        </Proximamente>
        <Proximamente fase={3}>
          Búsqueda, filtros por cuenta, categoría, tipo e importe, corrección individual y en bloque, y exportación a
          Excel.
        </Proximamente>
      </div>
    </>
  )
}
