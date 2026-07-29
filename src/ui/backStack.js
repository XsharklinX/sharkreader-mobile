/**
 * Pila del botón «atrás» de Android.
 *
 * El problema que resuelve: Capacitor entrega el evento `backButton` a **todos**
 * los oyentes registrados, no solo al último. Cada pantalla registraba el suyo,
 * así que estando dentro de un libro con el índice abierto, atrás cerraba el
 * índice *y además* salía del libro. Desde fuera parecía que atrás se saltaba un
 * nivel; en realidad se ejecutaban dos a la vez.
 *
 * Aquí hay un único oyente —lo registra `App`— y una pila. Atrás llama solo al
 * de arriba, que es el que corresponde a lo que el usuario tiene delante. Cada
 * capa que puede cerrarse se apunta al montarse y se borra al desmontarse.
 *
 * También sirve para el gesto de deslizar desde el borde, que Android traduce al
 * mismo evento.
 */

/** @type {Array<{id: number, handler: () => boolean|void}>} */
let stack = [];
let nextId = 1;

/**
 * Apunta un manejador. Devuelve la función para darse de baja.
 *
 * @param {() => boolean|void} handler
 *   Devuelve `true` si ha consumido el evento. Devolver `false` deja pasar el
 *   atrás al nivel de abajo: sirve para una capa que a veces tiene algo que
 *   cerrar y a veces no, sin tener que registrarse y desregistrarse en cada
 *   cambio de estado.
 */
export const pushBackHandler = (handler) => {
    const entry = { id: nextId++, handler };
    stack.push(entry);
    return () => { stack = stack.filter((item) => item.id !== entry.id); };
};

/**
 * Ejecuta el atrás. Recorre la pila de arriba abajo hasta que alguien lo
 * consume.
 *
 * @returns {boolean} `true` si alguna capa lo atendió.
 */
export const runBack = () => {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].handler() === true) return true;
    }
    return false;
};

/** Solo para tests. */
export const resetBackStack = () => { stack = []; nextId = 1; };

export const backStackDepth = () => stack.length;
