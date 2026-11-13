import { Encabezado, Proximamente } from '../componentes/Encabezado'

export function Empleado() {
  return (
    <>
      <Encabezado titulo="Gastos de empleado" subtitulo="Pendiente de reembolso y conciliación" />
      <Proximamente fase={3}>
        Marcado rápido (deslizar en el móvil, selección múltiple y atajo de teclado en escritorio), conciliación de
        reembolsos y los indicadores de pendiente, antigüedad, reembolsado en el año y diferencias.
      </Proximamente>
    </>
  )
}
