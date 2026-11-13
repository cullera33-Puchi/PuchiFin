/**
 * Vibración breve. Safari en el iPhone no tiene navigator.vibrate: marcar un interruptor nativo
 * oculto dentro de un toque produce un toque háptico (iOS 17.4 y posteriores).
 */
let interruptor: HTMLInputElement | null = null

function crearInterruptor(): HTMLInputElement {
  const label = document.createElement('label')
  label.setAttribute('aria-hidden', 'true')
  label.style.cssText = 'position:fixed;left:-200px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  input.tabIndex = -1
  label.appendChild(input)
  document.body.appendChild(label)
  return input
}

export function vibrar(ms = 10): void {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(ms)
      return
    }
    interruptor ??= crearInterruptor()
    interruptor.click()
  } catch {
    // sin vibración
  }
}
