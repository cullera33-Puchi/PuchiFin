export function SinConfigurar() {
  return (
    <div className="mx-auto grid min-h-dvh max-w-lg place-items-center px-4">
      <div className="tarjeta space-y-3 text-sm">
        <h1 className="text-lg font-semibold">Falta configurar Supabase</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Crea el fichero <code>.env.local</code> a partir de <code>.env.example</code> con la URL del proyecto y la
          clave pública. Los pasos completos están en el <code>README.md</code>.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-zinc-100 p-3 text-xs dark:bg-zinc-800">
          VITE_SUPABASE_URL=…{'\n'}VITE_SUPABASE_PUBLISHABLE_KEY=…
        </pre>
      </div>
    </div>
  )
}
