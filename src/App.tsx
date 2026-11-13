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
import { Empleado } from './paginas/Empleado'
import { Extracto } from './paginas/Extracto'
import { Movimientos } from './paginas/Movimientos'
import { Resumenes } from './paginas/Resumenes'

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <ProveedorInterfaz>
        <ProveedorActualizacion>
          <ProveedorDatos>
            <Routes>
              <Route element={<Estructura />}>
                <Route index element={<Extracto />} />
                <Route path="movimientos" element={<Movimientos />} />
                <Route path="empleado" element={<Empleado />} />
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
