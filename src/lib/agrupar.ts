/** Añade un elemento al grupo de su clave sin copiar la lista (agrupar miles de movimientos) */
export function anadirA<K, V>(grupos: Map<K, V[]>, clave: K, valor: V): void {
  const lista = grupos.get(clave)
  if (lista) lista.push(valor)
  else grupos.set(clave, [valor])
}
