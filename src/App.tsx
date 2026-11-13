import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Estructura } from './componentes/Estructura'
import { supabaseConfigurado } from './lib/supabase'
import { Acceso } from './paginas/Acceso'
import { Ajustes } from './paginas/ajustes/Ajustes'
import { Categorias } from './paginas/ajustes/Categorias'
import { Cuentas } from './paginas/ajustes/Cuentas'
import { General } from './paginas/ajustes/General'
import { Empleado } from './paginas/Empleado'
import { Extracto } from './paginas/Extracto'
import { Movimientos } from './paginas/Movimientos'
import { SinConfigurar } from './paginas/SinConfigurar'
import { ProveedorSesion, useSesion } from './sesion/Sesion'

function Rutas() {
  const { estado, error, salir } = useSesion()

  if (estado === 'cargando' || estado === 'preparando') {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-zinc-500">
        {estado === 'preparando' ? 'Preparando tus datos…' : 'Cargando…'}
      </div>
    )
  }
  if (estado === 'sin_sesion') return <Acceso />
  if (estado === 'error') {
    return (
      <div className="mx-auto grid min-h-dvh max-w-md place-items-center p-6">
        <div className="tarjeta space-y-3">
          <p className="font-medium">No se han podido preparar los datos</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{error}</p>
          <button className="boton-secundario" onClick={salir}>
            Salir
          </button>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<Estructura />}>
        <Route index element={<Extracto />} />
        <Route path="movimientos" element={<Movimientos />} />
        <Route path="empleado" element={<Empleado />} />
        <Route path="ajustes" element={<Ajustes />}>
          <Route index element={<Navigate to="cuentas" replace />} />
          <Route path="cuentas" element={<Cuentas />} />
          <Route path="categorias" element={<Categorias />} />
          <Route path="general" element={<General />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export function App() {
  if (!supabaseConfigurado) return <SinConfigurar />
  return (
    <BrowserRouter>
      <ProveedorSesion>
        <Rutas />
      </ProveedorSesion>
    </BrowserRouter>
  )
}
