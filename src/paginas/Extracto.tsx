import { FileText, FlaskConical, HardDriveDownload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Aviso, Encabezado, Proximamente } from '../componentes/Encabezado'
import { contarDatosPrueba } from '../datos/operaciones'
import { useDatos } from '../datos/ProveedorDatos'
import { avisoExportacion } from '../lib/avisos'
import { formatearFecha, formatearImporte } from '../lib/formato'

export function Extracto() {
  const db = useDatos()
  const prueba = contarDatosPrueba(db)
  const deuda = db.compromisos.find((c) => c.activo)
  const aviso = avisoExportacion(db)

  return (
    <>
      <Encabezado
        titulo="Extracto"
        subtitulo="Ingresos, gastos y ahorro del mes"
        accion={
          <Link to="/resumenes" className="boton-secundario">
            <FileText className="size-4" strokeWidth={2} /> Resúmenes
          </Link>
        }
      />
      <div className="mb-4 space-y-2">
        {!!prueba && (
          <Aviso tipo="info">
            <span className="flex flex-wrap items-center gap-2">
              <FlaskConical className="size-4 text-[#FF9500]" strokeWidth={2} /> Hay {prueba} movimientos de prueba.
              <Link to="/ajustes/herramientas" className="font-medium text-marca-700 underline dark:text-marca-500">
                Gestionarlos
              </Link>
            </span>
          </Aviso>
        )}
        {aviso && (
          <Aviso tipo="info">
            <span className="flex flex-wrap items-center gap-2">
              <HardDriveDownload className="size-4 text-[#007AFF]" strokeWidth={2} /> {aviso}
              <Link to="/ajustes/herramientas" className="font-medium text-marca-700 underline dark:text-marca-500">
                Exportar
              </Link>
            </span>
          </Aviso>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Proximamente fase={3}>
          El extracto mensual se activa cuando haya movimientos importados (fase 2) y llega completo en la fase 3: cabecera de
          ingresos, gastos y tasa de ahorro, desglose por categoría y comparativa con la media.
        </Proximamente>

        <section className="tarjeta">
          <h2 className="mb-3 text-sm font-semibold">Datos en este dispositivo</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Dato etiqueta="Cuentas activas" valor={db.cuentas.filter((c) => c.activa).length} a="/ajustes/cuentas" />
            <Dato
              etiqueta="Categorías"
              valor={`${db.categorias.filter((c) => !c.padre_id).length} (${db.categorias.filter((c) => c.padre_id).length} subcategorías)`}
              a="/ajustes/categorias"
            />
            <Dato etiqueta="Movimientos" valor={db.movimientos.length} />
            <Dato etiqueta="Fecha de inicio" valor={formatearFecha(db.ajustes.fecha_inicio)} a="/ajustes/general" />
            {deuda && <Dato etiqueta={deuda.nombre} valor={`${formatearImporte(deuda.deuda_inicial)} a ${formatearFecha(deuda.fecha_referencia)}`} />}
          </dl>
        </section>
      </div>
    </>
  )
}

function Dato({ etiqueta, valor, a }: { etiqueta: string; valor: string | number; a?: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{etiqueta}</dt>
      <dd className="font-medium tabular-nums">
        {a ? (
          <Link to={a} className="hover:text-marca-700 hover:underline">
            {valor}
          </Link>
        ) : (
          valor
        )}
      </dd>
    </div>
  )
}
