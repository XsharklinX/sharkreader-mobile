/**
 * Doblado de hoja.
 *
 * ## Qué es y qué no es
 *
 * Moon+ Reader dibuja su curvatura con OpenGL: renderiza la página a una
 * textura y la deforma sobre una malla, así que puede enseñar el reverso de la
 * hoja y una curva de papel de verdad. Eso es posible porque es una app nativa
 * que pinta el texto ella misma.
 *
 * Aquí el texto lo pinta epub.js dentro de un iframe, y **el contenido de un
 * iframe no se puede llevar a una textura** sin volver a dibujarlo a mano —
 * imposible con texto reflowable, tipografías incrustadas e imágenes del libro.
 * Así que el reverso de la hoja no se puede enseñar. Decir lo contrario sería
 * prometer algo que este motor no da.
 *
 * Lo que sí se puede, y es lo que hay aquí: **girar la hoja entera en
 * perspectiva sobre su borde**, con la sombra que proyecta al levantarse y el
 * brillo del pliegue. El texto gira con ella, en perspectiva, así que al
 * arrastrar despacio se ve la hoja separarse y el texto inclinarse con ella.
 * Es un pliegue real, no un desplazamiento con sombra pintada.
 *
 * ## Por qué el giro no llega a 90 grados
 *
 * A 90 grados la hoja queda de canto y desaparece: el usuario ve un hueco. Se
 * para en 76, donde ya se lee como «esta página se está yendo» y todavía hay
 * superficie. El resto del recorrido lo hace el desplazamiento lateral.
 */

/** Ángulo máximo de giro, en grados. Ver arriba por qué no son 90. */
export const MAX_ANGLE = 76;

/**
 * Distancia de perspectiva, en píxeles.
 *
 * Se declara aquí como referencia pero **la aplica el CSS en `.reader`**, el
 * padre del elemento que gira. `rotateY` toma el punto de fuga del ancestro:
 * ponerla en el mismo elemento que gira no hace nada y el giro sale plano.
 */
export const PERSPECTIVE = 1400;

/**
 * Cuánto se desplaza la hoja además de girar, como fracción del ancho.
 *
 * Solo con giro, la hoja se queda anclada por su borde y el movimiento se lee
 * como una puerta. Con algo de traslación se lee como una hoja que además se
 * separa del cuaderno, que es lo que hace el papel.
 */
export const SLIDE_FRACTION = 0.18;

/**
 * Estado del pliegue para un progreso dado.
 *
 * @param {number} progress  0 = hoja en su sitio, 1 = página cambiada.
 * @param {'next'|'prev'} direction
 * @param {number} width     Ancho de la página, para calcular la traslación.
 * @returns {{transform: string, origin: string, shade: number, foldAt: number}}
 */
export const curlState = (progress, direction, width = 0) => {
    const t = Math.min(1, Math.max(0, progress));

    // Avanzando, la hoja se levanta por su borde derecho y gira hacia la
    // izquierda: el eje de giro está a la izquierda. Retrocediendo, al contrario.
    const forward = direction === 'next';
    const origin = forward ? 'left center' : 'right center';

    // La curva de salida (no lineal) es lo que hace que el gesto se sienta como
    // papel: al principio la hoja se resiste y al final se va sola. Con un giro
    // lineal parece una animación de menú.
    const eased = t * t * (3 - 2 * t);

    const angle = eased * MAX_ANGLE * (forward ? -1 : 1);
    // Traslación en píxeles enteros: media unidad coloca cada letra a mitad de
    // píxel y el texto se redibuja distinto en cada fotograma. Es el mismo
    // motivo por el que el arrastre tiembla si no se redondea.
    const slide = Math.round(width * SLIDE_FRACTION * eased) * (forward ? -1 : 1) || 0;

    return {
        transform: `translate3d(${slide}px,0,0) rotateY(${angle.toFixed(2)}deg)`,
        origin,
        // La sombra crece con el ángulo pero no llega a negro: una hoja
        // levantada proyecta sombra, no se apaga.
        shade: Number((eased * 0.55).toFixed(3)),
        // Dónde cae el pliegue, para colocar el degradado del brillo.
        foldAt: forward ? 0 : 100,
    };
};

/**
 * Degradado de sombreado sobre la hoja que se va.
 *
 * Va del pliegue hacia el borde libre: el papel está más oscuro junto al doblez,
 * donde la luz no entra, y más claro en la punta. Sin este degradado el giro en
 * perspectiva parece una imagen inclinada en lugar de una hoja.
 *
 * @param {'next'|'prev'} direction
 */
export const shadeGradient = (direction) => (direction === 'next'
    ? 'linear-gradient(to right, rgba(0,0,0,.55) 0%, rgba(0,0,0,.14) 34%, rgba(0,0,0,0) 72%)'
    : 'linear-gradient(to left,  rgba(0,0,0,.55) 0%, rgba(0,0,0,.14) 34%, rgba(0,0,0,0) 72%)');

/**
 * Estado de la hoja que **entra**, la que estaba debajo.
 *
 * Apenas se mueve: en un libro de verdad la página de debajo está quieta y lo
 * que se mueve es la de encima. Solo se le quita un poco de escala para dar
 * profundidad, y vuelve a su sitio al terminar.
 */
export const underState = (progress) => {
    const t = Math.min(1, Math.max(0, progress));
    const scale = 0.988 + 0.012 * t;
    return {
        transform: `scale(${scale.toFixed(4)})`,
        // Ligeramente atenuada mientras hay una hoja encima tapándola.
        shade: Number(((1 - t) * 0.18).toFixed(3)),
    };
};
