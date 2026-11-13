# Guía de usabilidad para una web app de iPhone

Lecciones de diseño, comportamiento y herramientas de soporte (registro, copias, exportar, actualizaciones) aprendidas al construir y usar a diario una PWA instalada en la pantalla de inicio del iPhone. Las cifras salen de una app en uso real y probada en el dispositivo.

## 0. Cómo usar este documento (instrucciones para Claude Code)

- Trata este documento como especificación vinculante de comportamiento y aspecto, salvo que el diseño funcional del proyecto diga otra cosa. Si chocan, pregunta.
- Aplícalo desde el primer bloque de construcción. No dejes gestos, teclado, área segura, registro ni copias para el final: rehacerlos después cuesta mucho más.
- `<app>` es el prefijo propio de la app nueva para claves de `localStorage`, bases de IndexedDB y cachés (por ejemplo `miapp-v1`, `miapp-log`, `miapp-backups`, `miapp-v0.1.0`).
- Pregunta antes de añadir cualquier opción de Ajustes o función no descrita aquí ni en el diseño funcional.
- Interfaz en español; código, nombres y comentarios en inglés.
- Cada bloque se cierra probando en el iPhone **con la app instalada en pantalla de inicio**, no en Safari. Varias cosas de iOS solo fallan instaladas (ver sección 17).

---

## 1. Principios

1. **Tiene que pasar por nativa.** Quien la use no debe notar que es una web. Es un requisito al nivel de la funcionalidad.
2. **Los datos del dispositivo mandan en la interfaz.** Si hay servidor, sincroniza por detrás y nunca bloquea la pantalla.
3. **Todo lo que se hace se puede deshacer.** Cada acción deja un aviso con «Deshacer». Lo que no se puede deshacer se confirma antes y lo dice.
4. **Nada se pierde.** Ni texto escrito en una hoja, ni datos por un guardado fallido, ni por una actualización. Hay copia diaria automática y exportación.
5. **Se puede depurar desde el móvil.** Un registro interno que el usuario copia y pega en el chat sustituye a la consola, que en un iPhone instalado no existe.
6. Sin librerías de componentes. El aspecto iOS se hace con CSS propio. Ninguna dependencia que no funcione en Safari iOS.

---

## 2. Base técnica de la página

### 2.1 Cabecera de `index.html`

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="NombreCorto">
<meta name="theme-color" content="#161618" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#F9F9F9">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">   <!-- 180x180, sin transparencia -->
<link rel="icon" href="icons/icon-192.png">
```

- Si la app tiene selector de tema, al elegir claro u oscuro reescribe el `content` de las dos `theme-color`; en «Automático» cada una vuelve a su `media`.

### 2.2 `manifest.webmanifest`

```json
{
  "name": "Nombre", "short_name": "Nombre", "lang": "es",
  "start_url": "./", "scope": "./",
  "display": "standalone", "orientation": "portrait",
  "background_color": "#F2F2F7", "theme_color": "#F9F9F9",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

### 2.3 Reglas fijas de CSS y página

- **Nunca `100vh`.** `html` y `body` con `height:100%`; la altura útil con el teclado sale de `visualViewport` (sección 6.4).
- **El cuerpo no hace scroll ni rebota.** `body{overflow:hidden}` y `html,body{overscroll-behavior:none}`. Cada lista hace su propio scroll con `overflow-y:auto; -webkit-overflow-scrolling:touch; overscroll-behavior:contain`. El rebote de iOS queda dentro de la lista.
- **Área segura en todas las barras.** `env(safe-area-inset-top|bottom|left|right)`. Arriba, una franja fija del color de la barra (`body::before` con la altura del inset superior). En horizontal en un iPhone con isla, los laterales también: `padding-left:max(16px, env(safe-area-inset-left))`.
- **Sin resaltado gris de Safari, sin selección de texto ni menú de copiar en la interfaz:**
  ```css
  *{ -webkit-tap-highlight-color:transparent; }
  body{ -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
  input,textarea{ -webkit-user-select:text; user-select:text; }
  ```
- **Campos de 16 px como mínimo** (`font-size:max(16px,1rem)`). Por debajo, Safari hace zoom al enfocar.
- **Sin zoom por gesto:**
  ```js
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive:false });
  ```
- **Tamaño dinámico de texto (Dynamic Type).** `html{font-size:17px; font:-apple-system-body;}` y todos los tamaños en `rem`. Así la app sigue el tamaño de letra elegido en Ajustes del iPhone.
- **Fuente del sistema:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif` con `-webkit-font-smoothing:antialiased`.
- **Animaciones solo con `transform` y `opacity`.** Nada que recalcule el layout. Objetivo: 60 fps en un iPhone de hace cuatro años.
- **Pedir almacenamiento persistente al arrancar** para que Safari no borre los datos: `navigator.storage?.persist?.()`.

### 2.4 Estructura de la página

Contenedores fijos en el `body`, fuera de la app, para que nada los recorte:

```html
<div class="app" id="app"><nav class="tabbar" id="tabbar"></nav></div>
<div class="scrim" id="scrim"></div>      <!-- oscurecido de fondo -->
<div class="sheet" id="sheet"></div>      <!-- hoja inferior -->
<div class="asheet" id="asheet"></div>    <!-- hoja de acciones (confirmaciones) -->
<div class="pm" id="pmenu"></div>         <!-- menú anclado -->
<div class="toast" id="toast"><span id="toastText"></span><button id="toastBtn">Deshacer</button></div>
<!-- interruptor oculto para la vibración en iOS (sección 9.2) -->
<label style="position:fixed;left:-200px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none" aria-hidden="true">
  <input type="checkbox" switch id="hap" tabindex="-1"></label>
```

Sin build: HTML, CSS y JavaScript publicados tal cual, repartidos en archivos por tema (scripts clásicos cargados en orden; el último arranca la app). Cada archivo nuevo se añade también a la lista de caché del service worker (sección 15).

---

## 3. Sistema visual

### 3.1 Colores como variables, con tema claro y oscuro

```css
:root{
  color-scheme:light;
  --bg:#F2F2F7; --card:#FFFFFF; --sep:#C6C6C8; --ink:#000; --ink2:#8E8E93; --ink3:#AEAEB2;
  --blue:#007AFF; --red:#FF3B30; --orange:#FF9500; --green:#34C759; --greentx:#248A3D;
  --fill:#E5E5EA; --fill2:#D1D1D6; --press:#D9D9DE;
  --bar:rgba(249,249,249,.82); --mat:rgba(255,255,255,.88); --dim:rgba(0,0,0,.35);
  --kb:0px;  /* altura del teclado, la escribe JavaScript */
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){
  color-scheme:dark;
  --bg:#000; --card:#1C1C1E; --sep:#38383A; --ink:#FFF; --ink2:#8E8E93; --ink3:#636366;
  --blue:#0A84FF; --red:#FF453A; --orange:#FF9F0A; --green:#30D158; --greentx:#30D158;
  --fill:#2C2C2E; --fill2:#3A3A3C; --press:#2C2C2E;
  --bar:rgba(22,22,24,.82); --mat:rgba(36,36,38,.9); --dim:rgba(0,0,0,.55);
}}
:root[data-theme="dark"]{ /* mismos valores que el bloque oscuro, para el tema elegido a mano */ }
```

- Tema en Ajustes con segmento «Automático, Claro, Oscuro» (atributo `data-theme` en `html`).
- `body` siempre con `background:var(--bg)` explícito.

### 3.2 Medidas y formas

| Elemento | Valor |
| --- | --- |
| Texto de cuerpo | 17 px (1 rem) |
| Secundario | 15 px; etiquetas y metadatos 13 px (0,765 rem) |
| Título de pestaña | 22 px en negrita, a la izquierda, en una sola fila de 44 pt (sin título grande de 34 px: ocupa demasiado) |
| Título de pantalla apilada | 17 px centrado, con «Atrás» a la izquierda |
| Zona táctil mínima | 44 x 44 pt, también en círculos y casillas pequeños (el dibujo puede ser de 22 px; la zona activa no) |
| Grupos de filas | fondo `--card`, esquinas de 12 px, sobre fondo `--bg` |
| Separadores | 0,5 px `--sep`, con sangría a la izquierda (no llegan al borde) |
| Botones de hoja | 48 px de alto, esquinas de 12 px |
| Tab bar | 48 px más el inset inferior, translúcida |
| Botón flotante «+» | 56 px, la única sombra de la app |
| Sombras | ninguna salvo el botón flotante, menús y avisos |

### 3.3 Materiales translúcidos

Barras, hojas, menús y avisos con desenfoque:

```css
background:var(--bar);
-webkit-backdrop-filter:saturate(180%) blur(20px);
backdrop-filter:saturate(180%) blur(20px);
```

Cabeceras de grupo fijas al desplazarse (`position:sticky`) con el mismo material.

### 3.4 Legibilidad

- Etiquetas de color (cápsulas de categoría, proyecto): el texto con contraste de al menos 4,4 a 1 en los dos temas. En claro, oscurecer el color mezclándolo con negro; en oscuro, usar la variante oscura del sistema. El amarillo y el verde puros sobre blanco no se leen.
- No repetir en una fila lo que ya dice la pantalla (en la lista de «Hoy» no escribir «Hoy» en cada fila).
- Títulos de fila en hasta dos líneas (`-webkit-line-clamp:2`); los metadatos en una línea con «…».
- Estados vacíos: icono grande gris y una frase corta. Sin ilustraciones.

---

## 4. Navegación

### 4.1 Tab bar y pantallas

- Tab bar abajo, como en iOS, con hasta cinco pestañas. Nada de cajón lateral en el iPhone.
- Icono relleno en la pestaña activa, de línea en las demás.
- **Cambio de pestaña deslizando lateralmente** con seguimiento del dedo (además de tocar la tab bar). Empieza tras 10 px horizontales; si el dedo va más en vertical, es scroll y no cambia. Las filas con gestos propios y las listas que se desplazan en horizontal no participan.
- Cada pestaña conserva su posición de scroll.
- **La app abre siempre en la pantalla principal.** Al volver tras **más de dos horas** fuera, también vuelve a la principal con los filtros limpios, salvo que haya una hoja con texto sin guardar (entonces no toca nada y lo anota en el registro).

### 4.2 Entrar y volver (pila de pantallas)

- Entrar: la pantalla nueva llega desde la derecha y la anterior se desplaza un tercio a la izquierda (`translate3d(-33%,0,0)`), 0,5 s.
- **Volver deslizando** con seguimiento del dedo:
  - desde el borde izquierdo (primeros **28 px**), en cualquier pantalla apilada;
  - en pantallas de detalle, desde cualquier punto, salvo si el gesto empieza en un campo de texto o en un elemento con deslizamiento propio;
  - vuelve si pasa de **un tercio del ancho** o si es un **lanzamiento rápido** (velocidad de más de **0,4 px por ms** con al menos 30 px);
  - la pantalla de detrás se mueve a la vez (de -33 % a 0);
  - si el dedo se para antes de soltar, no cuenta la velocidad (más de 80 ms quieto la pone a cero);
  - un toque cancelado devuelve las pantallas y nunca vuelve atrás.
- Mientras dura una transición, un bloqueo corto (`navigating`, 520 ms) evita dobles toques que apilan dos pantallas.

### 4.3 Velocidad del dedo

Todos los gestos (volver, cerrar hojas, deslizar filas, cambiar de pestaña) aceptan distancia **o** velocidad. Solo con distancia, un gesto corto y rápido rebota y la app parece pesada. Velocidad suavizada:

```js
vx = 0.6 * (x - lastX) / (now - lastT) + 0.4 * vx;
const v = (e.timeStamp - lastT > 80) ? 0 : vx;   // dedo parado antes de soltar: sin velocidad
```

---

## 5. Animaciones

| Movimiento | Duración |
| --- | --- |
| Hojas, entrar y volver | 0,5 s |
| Hojas de acciones y oscurecido | 0,45 s |
| Cambio de pestaña, filas y reordenación | 0,4 s |
| Salida de una fila | 0,22 s |

- Curva única: `cubic-bezier(.32,.72,0,1)`. Los 350 ms habituales resultaron demasiado rápidos en uso real.
- Los temporizadores que esperan al final de una animación van ajustados a estas duraciones (cerrar hoja: 520 ms; volver: 520 ms).
- Con una hoja abierta, la app de detrás se encoge: `transform:scale(.96); border-radius:14px`.
- **Reducir movimiento:** con `prefers-reduced-motion: reduce`, las transiciones pasan a fundidos de 0,2 s y la pantalla de detrás no se mueve ni se encoge.
- Al completar, aplazar o eliminar, el resto de la lista se recoloca con animación FLIP (mide antes y después, anima la diferencia con `transform`).

---

## 6. Hojas inferiores

### 6.1 Comportamiento

- Suben desde abajo con asa superior (36 x 5 px), fondo oscurecido y la app encogida detrás. Alto máximo del 85 %.
- **Se cierran:** arrastrando hacia abajo más de **110 px** o con un lanzamiento rápido (0,4 px por ms y 30 px), tocando el fondo, con Cancelar o con Escape.
- Mientras se arrastra, el oscurecido y la escala de la app siguen al dedo.
- Si dentro hay una caja con scroll (un texto largo, el registro), el dedo desplaza la caja hasta su principio; solo entonces la hoja empieza a bajar.
- **Toques fantasma:** una hoja recién abierta ignora durante **450 ms** los toques en el fondo y en sus botones (iOS repite a veces el toque que la abrió). Si se cierra antes de 800 ms, se anota en el registro quién la cerró.
- Al cerrar, se vacía su contenido 520 ms después, para que un clic perdido no dispare un botón invisible.

### 6.2 Texto sin guardar

- Una hoja con texto escrito (nueva entrada, nota) define un guardián. Cualquier cierre hecho por el usuario (arrastrar, fondo, Cancelar, Escape) pregunta: **«Descartar»** en rojo o **«Seguir editando»**. Seguir editando devuelve el foco al campo, con el cursor al final, dentro del mismo toque (así iOS vuelve a abrir el teclado).
- Guardar cierra sin preguntar.

### 6.3 Campos y foco

- **El foco se pone de forma síncrona dentro del toque** que abre la hoja (`input.focus()` en el mismo manejador). Con `setTimeout`, iOS no abre el teclado.
- **Las hojas con campo de texto llevan las acciones en la cabecera** (Cancelar a la izquierda, título centrado, acción en azul a la derecha), no al pie: en iOS 26 la barra flotante del teclado tapa el pie de la hoja.
  ```js
  const sheadHTML = (title, cancel, ok) =>
    `<div class="shead"><button class="hbtn" data-x="cancel">${cancel}</button><h2>${title}</h2><button class="hbtn ok" data-x="ok">${ok}</button></div>`;
  // .shead{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;min-height:44px}
  ```
- Un menú abierto sobre una hoja (elegir categoría, prioridad) es anidado: cancelarlo devuelve la hoja con lo escrito y el foco.

### 6.4 Teclado

```js
// La hoja sube con el teclado: --kb es la parte de la pantalla que tapa el teclado
const vv = window.visualViewport;
const f = () => {
  const kb = Math.max(0, innerHeight - vv.height - vv.offsetTop);
  document.documentElement.style.setProperty('--kb', kb + 'px');
  document.documentElement.classList.toggle('kbup', kb >= 60 || kbShrunk());
};
vv.addEventListener('resize', f); vv.addEventListener('scroll', f);
// .sheet.on{ transform:translate3d(0, calc(-1 * var(--kb)), 0); }
```

- **iOS 26 puede encoger la ventana entera** en lugar del visual viewport. Detectarlo: `innerHeight < screen.height * 0.75`. En ese caso la página ya cabe sobre el teclado y no hay que subir nada.
- **Respaldo:** algunas versiones de iOS no informan del teclado en la app instalada (`--kb` se queda en 0 y la hoja queda tapada). Si un campo de la hoja tiene el foco y a los 1.200 ms no se ha detectado teclado, la hoja pasa a la parte superior de la pantalla (clase `.top`: arriba, con márgenes de 8 px, esquinas redondeadas, alto máximo del 46 %). Se anotan las medidas (pantalla, ventana, visible, desplazamiento, teclado) las primeras veces de cada arranque para ajustar en el dispositivo.
- Con el teclado abierto, la hoja añade margen inferior para que la barra flotante de iOS no tape el último elemento.

### 6.5 Hoja de acciones y confirmaciones

- Las confirmaciones de borrado son una hoja de acciones abajo, al estilo iOS: un grupo con el texto explicativo y la acción en rojo, y debajo un grupo aparte con «Cancelar».
- **El texto dice qué se borra y cuánto:** «Las 12 entradas del registro de este dispositivo se borrarán. Podrás deshacerlo durante unos segundos.» Si no se puede deshacer, lo dice: «No se puede deshacer.»
- Si hay versión de escritorio, la misma confirmación es una alerta de Mac centrada (icono, título, texto, Cancelar y la acción); Intro confirma y Esc cancela.

---

## 7. Menús anclados (pulsación larga)

- Pulsación larga de **500 ms**, con tolerancia de 8 px en vertical y 10 px en horizontal (si el dedo se mueve más, es scroll y no abre).
- Vibración breve al abrir.
- La fila se eleva (escala 1,03 y sombra), el resto se desenfoca y junto a ella aparece un menú compacto de 254 px con un icono por opción, en grupos separados por una franja de 8 px. Lo destructivo, en rojo y al final.
- **Se elige deslizando sin levantar el dedo** y soltando sobre la opción. Al soltar en el sitio, el menú queda abierto para tocar.
- El mismo componente, anclado al botón que lo abre, sustituye a las hojas inferiores para elegir valores (categoría, prioridad, tres puntos del detalle). La hoja inferior queda para confirmar borrados y para contenidos largos.
- El menú se coloca dentro del área segura y no tapa la fila si cabe arriba o abajo.

---

## 8. Listas y filas

### 8.1 Deslizar una fila

| Gesto | Resultado |
| --- | --- |
| A la derecha | Acción principal (completar). Fondo verde con icono que crece; vibración al pasar el umbral de **90 px**; también con lanzamiento rápido y 40 px. Tope elástico a partir de 110 px. |
| A la izquierda | Se detiene mostrando dos botones de 80 px (por ejemplo «Mañana» y «Eliminar»), 160 px en total, con tope elástico. Se abre con 70 px o con lanzamiento rápido. **No hay deslizamiento largo que ejecute una acción destructiva.** |
| Tocar | Abrir el detalle |
| Mantener | Menú anclado (sección 7) |

- Empieza tras 10 px horizontales; con 8 px verticales antes, es scroll.
- **Con los botones de una fila a la vista, el primer toque en cualquier otro sitio solo cierra la fila** (como en iOS): no abre, no filtra, no cambia de pestaña. Se hace con escuchas en fase de captura que detienen el toque y anulan su clic.
- En pantallas apiladas, los primeros 28 px del borde izquierdo son del gesto de volver, nunca de la fila.
- Un toque cancelado nunca completa ni abre botones.
- El mismo gesto (a la izquierda, botón Eliminar) sirve para otras listas: copias de seguridad, adjuntos, notas.

### 8.2 Completar sin que la lista salte

- Al tocar el círculo o deslizar a la derecha, la fila se marca y **se queda en su sitio atenuada durante 1,5 s**. Cada nueva marca reinicia el plazo. Después salen todas a la vez con animación y **un solo aviso** («3 tareas completadas») con Deshacer. Tocar otra vez una marcada la desmarca.
- Así se pueden marcar varias seguidas sin que el segundo toque caiga en otra fila.
- Al ir a segundo plano o cerrar la app, lo marcado se aplica en el momento.

### 8.3 Rendimiento

- Con más de **200 filas**, las que quedan lejos de la vista se pintan después (filas diferidas) y llevan `content-visibility:auto; contain-intrinsic-size:auto 62px`.
- Repintar solo lo que cambia: entrar y salir de una pantalla pinta solo esa pantalla; completar o cambiar un valor actualiza la fila y los contadores.
- **Nunca repintar mientras el usuario escribe, elige en un menú o tiene una hoja abierta**: cerraría el teclado o la hoja. Se marca la vista como desfasada y se repinta al terminar.
- Durante un gesto, ningún repintado sustituye la fila o pantalla que el dedo está tocando.

### 8.4 Detalles que se notan

- Cabeceras de grupo fijas al desplazarse, con fondo translúcido y recuento.
- Búsqueda con «Cancelar», recuento de resultados y comparación sin acentos.
- Enlaces y teléfonos tocables en los textos libres.
- Singular y plural siempre bien escritos («1 tarea», «3 tareas»).

---

## 9. Respuesta al usuario

### 9.1 Aviso con Deshacer (toast)

- Abajo, encima de la tab bar, dejando libre el botón flotante. Material translúcido, entra con `transform` y `opacity`.
- **4 segundos** con «Deshacer». Con otro botón distinto («Actualizar», «Ver»), 12 s.
- Toda acción que cambia datos lo muestra. Las acciones en bloque, un solo aviso con un solo Deshacer.
- Si el guardado falló, el aviso dice «No se pudo guardar en el dispositivo» en lugar de anunciar un éxito falso.

```js
let toastTimer = null, undoFn = null;
function toast(text, undo, label) {
  $('#toastText').textContent = text; undoFn = undo || null;
  const b = $('#toastBtn'); b.textContent = label || 'Deshacer'; b.style.display = undo ? '' : 'none';
  const el = $('#toast'); el.classList.add('on'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('on'); undoFn = null; }, label ? 12000 : 4000);
}
$('#toastBtn').addEventListener('click', () => { if (undoFn) { undoFn(); undoFn = null; } $('#toast').classList.remove('on'); });
```

### 9.2 Vibración en iOS

Safari iOS no tiene `navigator.vibrate`. Marcar un interruptor nativo oculto dentro de un toque da un toque háptico en iOS 17.4 y posteriores:

```js
const haptic = (ms = 10) => { try {
  if (navigator.vibrate) { navigator.vibrate(ms); return; }
  document.getElementById('hap')?.click();
} catch (e) {} };
```

Usarlo al completar, al cambiar un valor, al pasar el umbral de un deslizamiento, al abrir un menú y al volver atrás. Nunca en exceso.

### 9.3 Agitar para deshacer (opcional, desactivado de inicio)

- Interruptor en Ajustes, sección Gestos. Pide permiso de movimiento (`DeviceMotionEvent.requestPermission()`), que iOS vuelve a pedir en cada arranque: se pide de nuevo en el primer toque.
- Umbral: suma de cambios de aceleración mayor que 30, con 1,2 s entre sacudidas. Solo deshace si hay un aviso con «Deshacer» a la vista; nunca pulsa «Actualizar».

### 9.4 Tirar para refrescar

Si hay sincronización: tirar de la lista hacia abajo desde arriba, umbral de 110 px con vibración al alcanzarlo, rueda girando y al terminar «Sincronizado a las 18:40», «Sin conexión» o «No se pudo sincronizar» durante 1,4 s.

---

## 10. Datos y guardado

- **Un objeto único en `localStorage`** (`<app>-v1`) con todas las listas y los ajustes. Cada registro con `id`, `created` y `modified` (ISO). Los ajustes son del dispositivo.
- **Guardado agrupado:** las acciones en bloque guardan una sola vez (`batch(fn)`).
- **Al escribir en un campo largo** (título, notas), se guarda 400 ms después de la última tecla, no en cada tecla.
- **Antes de ir a segundo plano** (`visibilitychange` a oculto y `pagehide`) se guarda todo lo pendiente.
- **Almacenamiento lleno:** si `setItem` falla, recortar el registro a 50 entradas (o borrarlo) y reintentar una vez. Si vuelve a fallar, anotarlo y avisar «No se pudo guardar en el dispositivo».
- **Varias ventanas o pestañas a la vez** (ordenador): escuchar el evento `storage`. Si otra ventana cambió los datos, recargarlos copiando los valores sobre los objetos que ya tiene esta (las hojas abiertas siguen funcionando) y sin repintar hasta que termine de escribir. Al volver a la app (`visibilitychange` y `pageshow` con `persisted`), comparar el texto guardado con el último leído.
- **Cambio de día con la app abierta:** comprobarlo cada minuto (no con un único temporizador a medianoche, que un ordenador dormido retrasa) y al recibir el foco. Al cambiar, ejecutar lo que toque (pasar pendientes al día nuevo, copia diaria) y repintar.
- Archivos grandes (fotos, audios) en IndexedDB, con un tope de espacio y borrando lo más antiguo.

---

## 11. Registro (log) para depurar desde el móvil

Es la herramienta que más tiempo ahorra: el usuario copia el registro desde Ajustes y lo pega en el chat.

### 11.1 Especificación

- Clave `<app>-log` en `localStorage`; **400 entradas** como máximo (se descartan las más antiguas).
- Entrada: `{ t: ISO, l: 'info' | 'warn' | 'error', m: mensaje, x: detalle opcional }`.
- **Captura automática** de errores no controlados, promesas rechazadas y `console.error`.
- **Cabecera del texto copiado:** nombre y versión, «instalada» o «navegador», `userAgent`, fecha y hora local y recuento de datos (por ejemplo «proyectos 12, tareas 340»). Sin contenido privado.
- Líneas con formato `MM-DD hh:mm:ss [nivel] mensaje | detalle`.
- Mensajes en español, cortos, y detalle en JSON compacto.

```js
const LOGKEY = '<app>-log';
let LOG = []; try { LOG = JSON.parse(localStorage.getItem(LOGKEY) || '[]'); if (!Array.isArray(LOG)) LOG = []; } catch (e) { LOG = []; }
function log(level, msg, extra) {
  const e = { t: new Date().toISOString(), l: level, m: String(msg) };
  if (extra !== undefined) { try { e.x = typeof extra === 'string' ? extra : JSON.stringify(extra); } catch (err) { e.x = String(extra); } }
  LOG.push(e); if (LOG.length > 400) LOG = LOG.slice(-400);
  try { localStorage.setItem(LOGKEY, JSON.stringify(LOG)); } catch (err) {}
}
window.addEventListener('error', e => log('error', e.message || 'Error',
  (e.filename || '').split('/').pop() + ':' + e.lineno + ':' + e.colno + (e.error?.stack ? '\n' + e.error.stack : '')));
window.addEventListener('unhandledrejection', e => log('error', 'Promesa rechazada: ' + (e.reason?.message || e.reason), e.reason?.stack));
const _ce = console.error.bind(console);
console.error = (...a) => { log('error', a.map(x => x?.message || String(x)).join(' ')); _ce(...a); };

function logText() {
  let st = '?'; try { st = (navigator.standalone === true || matchMedia('(display-mode: standalone)').matches) ? 'instalada' : 'navegador'; } catch (e) {}
  const head = 'MiApp v' + APP_VERSION + ' | ' + st + ' | ' + navigator.userAgent + ' | ' + new Date().toString() /* + recuentos */;
  const lines = LOG.map(e => e.t.replace('T', ' ').slice(5, 19) + ' [' + e.l + '] ' + e.m + (e.x ? ' | ' + e.x : ''));
  return head + '\n' + (lines.length ? lines.join('\n') : '(sin entradas)');
}
```

### 11.2 Qué se anota

- Arranque: «Inicio v0.1.0 (instalada)» con recuentos.
- Cada operación relevante: importar, exportar, copia creada, restaurada o borrada, actualización descargada y aplicada, sincronización (inicio, fin, errores, conflictos), permisos pedidos y su resultado, notificaciones recibidas.
- Cosas raras para ajustar en el dispositivo: hoja cerrada antes de 800 ms, toque en el fondo ignorado, medidas del teclado, vuelta a la pantalla principal omitida.
- **Avisos repetidos limitados** (por ejemplo, uno por minuto) para que no llenen las 400 entradas.
- Nunca contraseñas, claves ni el contenido de los datos.

### 11.3 Interfaz (Ajustes, sección Registro)

- **«Ver registro»** con el número de entradas: hoja con el texto en una caja de solo lectura (monoespaciada, 12 px) y los botones **Copiar**, **Compartir** (si hay `navigator.share`) y **Borrar**.
- **«Copiar registro»** directo.
- **«Borrar registro»** en rojo, solo si hay entradas: confirmación con el número de entradas y **Deshacer**. Al deshacer, las entradas vuelven por delante de lo anotado mientras tanto:
  ```js
  function logClear() { const was = LOG; logPut([]); render();
    toast('Registro borrado', () => { logPut(was.concat(LOG).slice(-400)); render(); }); }
  ```
- Copiar al portapapeles con respaldo para iOS:
  ```js
  async function copyText(t, msg) {
    try { await navigator.clipboard.writeText(t); toast(msg || 'Copiado'); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px;'; document.body.appendChild(ta);
      ta.select(); ta.setSelectionRange(0, t.length);           // iOS solo selecciona con setSelectionRange
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) {}
      ta.remove(); toast(ok ? (msg || 'Copiado') : 'No se pudo copiar');
    }
  }
  ```
- Si hay varias ventanas, el evento `storage` de la clave del registro actualiza el registro en memoria.
- Para las pruebas automáticas, conviene un botón o función oculta que lance un «Error de prueba» y comprobar que aparece en el registro.

---

## 12. Copias de seguridad locales

Red de seguridad en el propio dispositivo, independiente del servidor.

### 12.1 Especificación

- Base IndexedDB `<app>-backups` con dos almacenes: `snapshots` (la copia completa) y `meta` (fecha, hora de creación y recuentos), para listar sin leer las copias enteras.
- **Una copia automática al día**, al arrancar y al cambiar de día con la app abierta. Se conservan **las 7 más recientes**.
- **«Crear copia ahora»** a mano.
- Copia previa automática antes de operaciones de riesgo (importar, restaurar, primera sincronización, migraciones, vaciar el dispositivo).
- Si IndexedDB no está disponible, se anota como aviso y la app sigue.

### 12.2 Interfaz (Ajustes, sección Copias de seguridad)

- Lista con fecha y número de elementos («12 de noviembre, 340 tareas»). Sin copias: «Todavía ninguna».
- **Restaurar:** tocar la copia, confirmación que dice qué se sustituye y cuántos elementos trae, y **Deshacer** después.
- **Borrar una copia:** deslizar la fila a la izquierda (botón Eliminar) o desde su menú. Confirmación «La copia de ayer (340 tareas) se borrará de este iPhone. No se puede deshacer.» **Sin Deshacer.**
- **«Borrar todas las copias»** al pie, con confirmación y sin Deshacer.
- Una copia de hoy borrada a mano no se vuelve a crear hasta mañana (marca `<app>-bk-skip` con la fecha).
- Restaurar, importar y borrar se anotan en el registro.

```js
const BK = {
  open() { return new Promise((res, rej) => { const r = indexedDB.open('<app>-backups', 1);
    r.onupgradeneeded = () => { const db = r.result;
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'date' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'date' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  metaOf: x => ({ date: x.date, created: x.created, items: (x.data.items || []).length }),
  async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => {
    const t = db.transaction(['snapshots', 'meta'], mode); fn(t.objectStore('snapshots'), t.objectStore('meta'));
    t.oncomplete = () => { db.close(); res(); }; t.onerror = () => { db.close(); rej(t.error); }; }); },
  async list() { const db = await this.open(); return new Promise((res, rej) => {
    const r = db.transaction('meta').objectStore('meta').getAll();
    r.onsuccess = () => { db.close(); res((r.result || []).sort((a, b) => a.date < b.date ? 1 : -1)); }; r.onerror = () => rej(r.error); }); },
  async get(date) { const db = await this.open(); return new Promise((res, rej) => {
    const r = db.transaction('snapshots').objectStore('snapshots').get(date);
    r.onsuccess = () => { db.close(); res(r.result); }; r.onerror = () => rej(r.error); }); },
  async put(date) { const snap = { date, created: new Date().toISOString(), data: exportData() };
    await this.tx('readwrite', (st, meta) => { st.put(snap); meta.put(this.metaOf(snap)); });
    const old = (await this.list()).slice(7);
    if (old.length) await this.tx('readwrite', (st, meta) => old.forEach(b => { st.delete(b.date); meta.delete(b.date); })); },
  del(date) { return this.tx('readwrite', (st, meta) => { st.delete(date); meta.delete(date); }); },
  clear() { return this.tx('readwrite', (st, meta) => { st.clear(); meta.clear(); }); },
};
```

- Si la app tiene cuentas: cada copia guarda a qué cuenta pertenece y nunca se restaura en otra.

---

## 13. Exportar e importar

Ajustes, sección Datos:

- **Exportar a archivo (JSON):** `{ app, version, exported, ...listas }`. En el iPhone, por la hoja de compartir con `navigator.share({ files:[file] })` si `navigator.canShare` lo permite; si no, descarga con un enlace temporal; y como último recurso, copiar el texto.
- **Exportar a Excel (CSV):** separador `;`, UTF-8 **con BOM** (`'﻿'`), saltos `\r\n`, todos los campos entre comillas, y **un apóstrofo delante de cualquier celda que empiece por `=`, `+`, `-` o `@`** (Excel la ejecutaría como fórmula aunque vaya entre comillas). Nombre `<app>-AAAA-MM-DD.csv`.
- **Importar desde archivo** (selector de archivo) e **importar pegando texto** (hoja con un área de texto).
- **Fusión por id:** lo desconocido se añade y lo conocido se sustituye solo si la copia importada tiene un `modified` más reciente. Resumen al terminar: «3 nuevos, 1 actualizado». Un texto o archivo no válido avisa sin tocar nada y se anota.
- Si hay adjuntos, el JSON lleva la lista de adjuntos, no los archivos.

---

## 14. Datos de prueba

- Generador que crea un volumen realista (unas 150 entradas) con identificadores que empiezan por `demo-`. Sirve para probar rendimiento y aspecto con carga.
- «Eliminar datos de prueba» borra solo lo que empieza por `demo-`; lo propio que estuviera dentro de una categoría de prueba se queda, sin categoría.
- En Ajustes solo aparece «Eliminar datos de prueba» mientras quedan; el generador no se ofrece al usuario final.
- Los datos de prueba nunca se suben a un servidor.

---

## 15. Actualizaciones (service worker)

### 15.1 Reglas

- **Cada versión publicada sube dos cosas:** `APP_VERSION` en el código y el nombre de la caché en `sw.js` (`const CACHE = '<app>-v0.1.1'`). Sin cambiar la caché, los iPhone instalados no reciben la versión nueva.
- `SHELL`: lista de **todos** los archivos que carga la app. Si falta uno, la app instalada no arranca sin conexión.
- Al instalar, descargar con `cache:'reload'` para no guardar una copia vieja del servidor.
- **No llamar a `skipWaiting` al instalar.** La página ofrece la versión nueva y la aplica cuando el usuario la acepta.
- Al activar, borrar solo las cachés propias (`k.startsWith('<app>-')`): en `github.io` varias apps comparten origen y caché.
- Navegación siempre a `index.html` de la caché (la app abre sin conexión); si falta, se rellena desde la red.
- Un archivo de configuración generado al publicar (claves públicas) va **primero por red** y con copia en caché para trabajar sin conexión.

### 15.2 Aviso de nueva versión

- Al detectar una versión instalada en espera: aviso «Nueva versión disponible» con botón **Actualizar** (12 s). También en Ajustes, sección Versión, mientras siga pendiente.
- **Nunca sustituir un aviso con Deshacer activo:** esperar a que desaparezca y ofrecer la versión después.
- Comprobar si hay versión nueva cada vez que la app vuelve al primer plano (`reg.update()`).
- Recargar solo cuando el usuario pidió actualizar. La primera instalación también dispara `controllerchange` y no debe recargar la página.

```js
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (reloading) return;
  if (!hadController && !updateRequested) { hadController = true; return; }  // primera instalación: sin recarga
  reloading = true; location.reload();
});
```

### 15.3 Novedades al actualizar

- `novedades.json` en la raíz, publicado con la app, **fuera de `SHELL`** y leído siempre de la red (`fetch(..., { cache:'no-store' })`; el service worker lo deja pasar).
- Formato: `[{ "version":"0.2.0", "date":"2026-11-13", "items":["…", "…"] }, …]`, de la más reciente a la más antigua.
- Al tocar Actualizar se abre la hoja «Novedades de la 0.2.0» con todas las versiones que el dispositivo no tenía, y los botones «Más tarde» y «Actualizar». Si no se puede leer (sin conexión) o no hay ninguna nueva, actualiza directamente.
- En Ajustes, «Novedades» abre la lista completa con la versión instalada marcada.
- **Cada versión añade de 3 a 5 líneas escritas para el usuario**, no el registro técnico de cambios.

---

## 16. Ajustes: orden de secciones recomendado

1. Cuenta (si hay inicio de sesión) y estado de la sincronización.
2. Notificaciones (si las hay): activar, dispositivos, prueba.
3. Las opciones propias de la app.
4. **Datos:** Exportar a archivo (JSON), Exportar a Excel (CSV), Importar desde archivo, Importar pegando texto.
5. **Copias de seguridad:** lista, Crear copia ahora, Borrar todas las copias.
6. **Gestos:** Agitar para deshacer (solo iPhone).
7. Datos de prueba (solo si quedan).
8. **Registro:** Ver registro (con número de entradas), Copiar registro, Borrar registro.
9. **Aspecto:** Tema (Automático, Claro, Oscuro).
10. Elementos archivados.
11. **Versión:** número, Nueva versión disponible (si la hay), Novedades.

Primera vez que se abre la app: hoja de bienvenida corta con los tres gestos principales y «Entendido» (se recuerda en `settings.tipsSeen`).

---

## 17. Limitaciones de iOS comprobadas (no volver a descubrirlas)

| Tema | Lo que pasa | Qué hacer |
| --- | --- | --- |
| Reconocimiento de voz (Web Speech API) | No transcribe con la app instalada | Dictado del teclado de iOS: la hoja se abre con el campo de texto enfocado. Micrófono propio solo en una pestaña normal de Safari |
| Grabar audio | MediaRecorder graba m4a (AAC). No se puede grabar y dictar a la vez | Grabar y dictar como elementos distintos |
| Foco con retardo | `focus()` dentro de `setTimeout` no abre el teclado | Foco síncrono dentro del toque |
| Barra del teclado de iOS 26 | Tapa el pie de las hojas | Acciones en la cabecera de la hoja |
| Teclado en la app instalada | A veces no reduce el visual viewport, o reduce la ventana entera | Respaldo con la hoja arriba y detección de ventana encogida (6.4) |
| Toques fantasma | Un toque se repite y cierra la hoja que acaba de abrir | Ignorar 450 ms tras abrir |
| Vibración | No existe `navigator.vibrate` | Interruptor nativo oculto (9.2) |
| Permiso de movimiento | Se pide en cada arranque | Volver a pedirlo en el primer toque |
| Campos de menos de 16 px | Zoom al enfocar | `font-size:max(16px,1rem)` |
| Notificaciones | Solo con la app instalada, iOS 16.4 o posterior y permiso pedido desde un toque dentro de la app. Sin botones en el aviso | Explicar en una frase para qué se pide; las acciones (posponer) se ofrecen al abrir la app desde el aviso |
| Insignia del icono | `navigator.setAppBadge(n)` y `clearAppBadge()` funcionan instalada | Actualizarla en cada repintado |
| Atajos de iOS con `?add=` | El Atajo abre Safari, cuyo almacenamiento es distinto del de la app instalada: lo enviado no llega | Si hace falta, enviar a un servidor y que la app lo recoja |
| Inicio de sesión con Google | Es el primer riesgo en modo instalado | Probarlo instalada desde el primer día |
| Borrado de datos | Safari puede borrar el almacenamiento de webs poco usadas | `navigator.storage.persist()`, copias diarias y exportación |
| Hoja de compartir | Una PWA no aparece como destino de la hoja de compartir de iOS | Atajo de iOS que envía a un servidor |

---

## 18. Pruebas

- Pruebas de regresión automáticas con Playwright y Chromium en el repositorio, ejecutadas por GitHub Actions **antes de cada publicación**: si fallan, no se publica.
- Cada prueba levanta su propio servidor en un puerto fijo, deja capturas y su salida en una carpeta ignorada por git, imprime un JSON con su lista de errores y termina con código distinto de cero si falla.
- Una prueba que falla se repite una vez (fallos intermitentes) y el resumen dice cuáles pasaron al repetir.
- Las pruebas que dependen de la fecha fijan el reloj (por ejemplo, a las 10:10) o eligen días que no caigan en fin de semana.
- Además de las pruebas automáticas, **cada bloque se prueba en el iPhone instalado** antes de seguir.
- Mantener un `CHANGELOG.md` con lo entregado en cada versión.

---

## 19. Lista de arranque para la app nueva

- [ ] Cabecera, manifest e iconos (192, 512 y apple-touch-icon de 180).
- [ ] Variables de color claro y oscuro, tema en Ajustes.
- [ ] Cuerpo sin scroll, listas con su scroll, área segura, sin `100vh`, campos de 16 px, sin zoom.
- [ ] Tab bar, cabecera de 44 pt, pila de pantallas con gesto de volver por distancia y velocidad.
- [ ] Hoja inferior con arrastre, guardia de 450 ms, acciones en la cabecera si hay campo, guardián de texto sin guardar, teclado con `--kb` y respaldo.
- [ ] Hoja de acciones para confirmar, con textos que dicen qué y cuánto se borra.
- [ ] Menú anclado con pulsación larga y elegir deslizando.
- [ ] Filas con deslizamiento a derecha (acción) e izquierda (botones), primer toque fuera solo cierra.
- [ ] Aviso con Deshacer en toda acción; vibración con el interruptor oculto.
- [ ] Guardado agrupado, espera de 400 ms al escribir, guardar al ir a segundo plano, almacenamiento lleno, varias ventanas, cambio de día.
- [ ] Registro con captura de errores, ver, copiar, compartir y borrar con Deshacer.
- [ ] Copias diarias en IndexedDB (7), crear, restaurar con Deshacer, borrar una y todas.
- [ ] Exportar JSON y CSV, importar archivo y texto con fusión por id.
- [ ] Datos de prueba con prefijo `demo-`.
- [ ] Service worker con `SHELL` completo, versión en caché, aviso de actualización y `novedades.json`.
- [ ] Vuelta a la pantalla principal tras dos horas fuera.
- [ ] Reducir movimiento.
- [ ] Pruebas automáticas antes de publicar y prueba en el iPhone instalado al cerrar cada bloque.
