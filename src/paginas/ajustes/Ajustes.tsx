import { NavLink, Outlet } from 'react-router-dom'
import { Encabezado } from '../../componentes/Encabezado'
import { useSesion } from '../../sesion/Sesion'

const PESTANAS = [
  { a: 'cuentas', texto: 'Cuentas' },
  { a: 'categorias', texto: 'Categorías' },
  { a: 'general', texto: 'General' },
]

export function Ajustes() {
  const { sesion, salir } = useSesion()
  return (
    <>
      <Encabezado
        titulo="Ajustes"
        accion={
          <button className="boton-secundario md:hidden" onClick={salir} title={sesion?.user.email ?? ''}>
            Salir
          </button>
        }
      />
      <nav className="mb-5 flex gap-1 rounded-xl bg-zinc-200/70 p-1 dark:bg-zinc-800/70">
        {PESTANAS.map(({ a, texto }) => (
          <NavLink
            key={a}
            to={a}
            className={({ isActive }) =>
              `flex-1 rounded-lg px-3 py-1.5 text-center text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-950 dark:text-zinc-100'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
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
