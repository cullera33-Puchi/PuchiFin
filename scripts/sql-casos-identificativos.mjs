// Genera las comprobaciones SQL a partir de tests/fixtures/casos_identificativos.json,
// para que la base de datos y el frontal detecten exactamente los mismos casos.
import { readFileSync } from 'node:fs'

const casos = JSON.parse(
  readFileSync(new URL('../tests/fixtures/casos_identificativos.json', import.meta.url), 'utf8'),
)
const lit = (s) => `'${s.replaceAll("'", "''")}'`
const lineas = ['do $$', 'begin']
for (const { texto } of casos.positivos) {
  lineas.push(`  assert public.contiene_dato_identificativo(${lit(texto)}), ${lit('debe detectar: ' + texto)};`)
}
for (const texto of casos.negativos) {
  lineas.push(`  assert not public.contiene_dato_identificativo(${lit(texto)}), ${lit('no debe detectar: ' + texto)};`)
}
lineas.push(
  `  raise notice 'OK: ${casos.positivos.length} positivos y ${casos.negativos.length} negativos coinciden con el frontal';`,
  'end $$;',
)
console.log(lineas.join('\n'))
