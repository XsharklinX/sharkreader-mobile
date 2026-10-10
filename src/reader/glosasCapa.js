/**
 * Las glosas se dibujan en una capa aparte, no dentro del texto.
 *
 * ## Por qué no `<ruby>`
 *
 * Sería lo natural, pero obliga a partir nodos de texto y envolver palabras, y
 * las posiciones del libro (CFI) se calculan contando esos nodos: la posición
 * guardada y los subrayados del capítulo pasarían a apuntar a otro sitio.
 *
 * Así que el texto no se toca. Se busca cada palabra con un `Range`, se mide
 * dónde ha quedado en la página y se pone su glosa encima, en una capa colgada
 * de `<html>` —fuera de `<body>`, que es donde cuentan los CFI—. Mientras hay
 * glosas, las líneas llevan un poco más de interlineado para que quepan.
 *
 * La capa se vuelve a colocar cada vez que la página cambia de forma (otra
 * letra, otro margen): los rangos siguen valiendo porque el texto no cambió.
 */

export const ID_CAPA = 'sr-glosas';
export const CLASE_ACTIVA = 'sr-con-glosas';

export const CSS_GLOSAS = `html.${CLASE_ACTIVA} body p, html.${CLASE_ACTIVA} body li, html.${CLASE_ACTIVA} body blockquote{line-height:2.05!important;}
#${ID_CAPA}{position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2;}
#${ID_CAPA} span{position:absolute;transform:translate(-50%,-100%);white-space:nowrap;font-size:.52em;line-height:1;
font-family:Roboto,"Segoe UI",system-ui,sans-serif;font-weight:500;opacity:.72;color:currentColor;}`;

/**
 * Los rangos de las palabras elegidas: la primera aparición en cada párrafo.
 *
 * @param {Document} doc
 * @param {Map<Element, string[]>} elegidas
 * @returns {Array<{range: Range, palabra: string}>}
 */
export const rangosDe = (doc, elegidas) => {
    const salida = [];
    for (const [parrafo, palabras] of elegidas) {
        for (const palabra of palabras) {
            const recorrido = doc.createTreeWalker(parrafo, 4 /* SHOW_TEXT */);
            const patron = new RegExp(`(^|[^\\p{L}])(${palabra})(?=[^\\p{L}]|$)`, 'u');
            for (let nodo = recorrido.nextNode(); nodo; nodo = recorrido.nextNode()) {
                if (nodo.parentElement?.closest('.sr-traduccion')) continue;
                const m = nodo.data.match(patron);
                if (!m) continue;
                const inicio = m.index + m[1].length;
                const range = doc.createRange();
                range.setStart(nodo, inicio);
                range.setEnd(nodo, inicio + palabra.length);
                salida.push({ range, palabra });
                break;
            }
        }
    }
    return salida;
};

/**
 * Pinta (o vuelve a pintar) la capa con las glosas encima de cada palabra.
 *
 * @param {Document} doc
 * @param {Array<{range: Range, palabra: string}>} entradas
 * @param {Map<string, string>} glosas palabra en minúscula → glosa
 * @returns {number} cuántas se han pintado
 */
export const pintarCapa = (doc, entradas, glosas, idioma = 'en') => {
    const html = doc.documentElement;
    html.classList.add(CLASE_ACTIVA);
    let capa = doc.getElementById(ID_CAPA);
    if (!capa) {
        capa = doc.createElement('div');
        capa.id = ID_CAPA;
        capa.setAttribute('aria-hidden', 'true');
        html.appendChild(capa);
    }
    capa.textContent = '';

    const vista = doc.defaultView;
    const desplX = vista?.scrollX || 0;
    const desplY = vista?.scrollY || 0;
    let pintadas = 0;
    for (const { range, palabra } of entradas) {
        const glosa = glosas.get(palabra.toLocaleLowerCase(idioma));
        if (!glosa || glosa.toLocaleLowerCase(idioma) === palabra.toLocaleLowerCase(idioma)) continue;
        const caja = range.getClientRects?.()[0];
        if (!caja || !caja.width) continue;
        const span = doc.createElement('span');
        span.textContent = glosa;
        span.style.left = `${Math.round(caja.left + caja.width / 2 + desplX)}px`;
        span.style.top = `${Math.round(caja.top + desplY - 1)}px`;
        capa.appendChild(span);
        pintadas += 1;
    }
    return pintadas;
};

/** Quita la capa y el interlineado extra. */
export const quitarCapa = (doc) => {
    doc.getElementById(ID_CAPA)?.remove();
    doc.documentElement?.classList.remove(CLASE_ACTIVA);
};

/**
 * Una glosa tiene que ser corta: dos palabras como mucho. Lo que devuelve un
 * traductor para una palabra suelta a veces es una frase entera.
 */
export const glosaCorta = (texto = '') => String(texto)
    .replace(/[.,;:!?¡¿"«»]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ')
    .slice(0, 22);
