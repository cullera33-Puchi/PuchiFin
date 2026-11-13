import { NavLink, Outlet } from 'react-router-dom'
import { Encabezado } from '../../componentes/Encabezado'
import { useSesion } from '../../sesion/Sesion'

const PESTANAS = [
  { a: 'cuentas', texto: 'Cuentas' },
  { a: 'categorias', texto: 'Categorías' },
  { a: 'general', texto: 'General' },
  { a: 'herramientas', texto: 'Herramientas' },
]

export function Ajustes() {
  const { sesion, salir } = useSesion()
  return (
    <>
      <Encabezado
        titulo="Ajustes"
        accion={
          <button className="boton-texto md:hidden" onClick={salir} title={sesion?.user.email ?? ''}>
            Salir
          </button>
        }
      />
      <nav className="mb-5 flex gap-0.5 rounded-[9px] bg-zinc-200/80 p-0.5 dark:bg-zinc-800">
        {PESTANAS.map(({ a, texto }) => (
          <NavLink
            key={a}
            to={a}
            className={({ isActive }) =>
              `flex-1 rounded-[7px] px-1 py-1 text-center text-[13px] font-medium transition ${
                isActive
                  ? 'bg-white text-zinc-900 shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)] dark:bg-zinc-600 dark:text-white'
                  : 'text-zinc-700 dark:text-zinc-300'
              }`
            }
          >
            {texto}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  )
}
