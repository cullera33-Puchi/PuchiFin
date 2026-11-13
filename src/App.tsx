import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProveedorActualizacion } from './componentes/Actualizacion'
import { Estructura } from './componentes/Estructura'
import { ProveedorInterfaz } from './componentes/Interfaz'
import { ProveedorDatos } from './datos/ProveedorDatos'
import { Ajustes } from './paginas/ajustes/Ajustes'
import { Categorias } from './paginas/ajustes/Categorias'
import { Cuentas } from './paginas/ajustes/Cuentas'
import { General } from './paginas/ajustes/General'
import { Herramientas } from './paginas/ajustes/Herramientas'
import { Extracto } from './paginas/Extracto'
import { CategoriaMes } from './paginas/CategoriaMes'
import { Importaciones } from './paginas/Importaciones'
import { Movimientos } from './paginas/Movimientos'
import { Categorizar } from './paginas/Categorizar'
import { Reglas } from './paginas/ajustes/Reglas'
import { Resumenes } from './paginas/Resumenes'

// Pantallas pesadas (gráficos y lectura de Excel): se cargan al abrirlas
const Analisis = lazy(() => import('./paginas/Analisis').then((m) => ({ default: m.Analisis })))
const Informes = lazy(() => import('./paginas/Informes').then((m) => ({ default: m.Informes })))
const InformeCategoria = lazy(() => import('./paginas/Informes').then((m) => ({ default: m.InformeCategoria })))
const Importar = lazy(() => import('./paginas/Importar').then((m) => ({ default: m.Importar })))
const cargando = <p className="py-10 text-center text-sm text-zinc-500">Cargando…</p>

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <ProveedorInterfaz>
        <ProveedorActualizacion>
          <ProveedorDatos>
            <Routes>
              <Route element={<Estructura />}>
                <Route index element={<Extracto />} />
                <Route path="extracto/categoria/:id" element={<CategoriaMes />} />
                <Route path="analisis" element={<Suspense fallback={cargando}><Analisis /></Suspense>} />
                <Route path="informes" element={<Suspense fallback={cargando}><Informes /></Suspense>} />
                <Route path="informes/categoria/:id" element={<Suspense fallback={cargando}><InformeCategoria /></Suspense>} />
                <Route path="movimientos" element={<Movimientos />} />
                <Route path="movimientos/importar" element={<Suspense fallback={cargando}><Importar /></Suspense>} />
                <Route path="movimientos/importaciones" element={<Importaciones />} />
                <Route path="movimientos/categorizar" element={<Categorizar />} />
                <Route path="ajustes/reglas" element={<Reglas />} />
                <Route path="empleado/*" element={<Navigate to="/" replace />} />
                <Route path="resumenes" element={<Resumenes />} />
                <Route path="ajustes" element={<Ajustes />}>
                  <Route index element={<Navigate to="cuentas" replace />} />
                  <Route path="cuentas" element={<Cuentas />} />
                  <Route path="categorias" element={<Categorias />} />
                  <Route path="general" element={<General />} />
                  <Route path="herramientas" element={<Herramientas />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </ProveedorDatos>
        </ProveedorActualizacion>
      </ProveedorInterfaz>
    </BrowserRouter>
  )
}
