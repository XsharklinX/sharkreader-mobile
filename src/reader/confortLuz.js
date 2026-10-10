/**
 * La página se adapta a la luz.
 *
 * ## Qué hace
 *
 * Con la lectura del sensor de luz ambiente decide en qué **situación** se está
 * leyendo —a oscuras, con poca luz, en interior, con mucha luz— y propone tema,
 * atenuación y filtro cálido para ella. Por la noche en la cama, noche cálida y
 * brillo bajo; al salir al sol, papel claro y sin atenuar.
 *
 * ## Lo que no debe hacer
 *
 * **Parpadear.** La luz real cambia a cada momento: una sombra, girar el
 * teléfono, pasar junto a una lámpara. Si la página respondiera a cada lectura,
 * cambiaría de tema diez veces por minuto. Tres frenos:
 *
 *  1. La lectura se suaviza (media móvil en escala logarítmica, que es como el
 *     ojo percibe la luz: de 5 a 10 lux es tanto salto como de 500 a 1000).
 *  2. Los umbrales tienen histéresis: para volver al nivel anterior hay que
 *     pasar el umbral con margen, no rozarlo.
 *  3. Un nivel nuevo tiene que mantenerse unos segundos antes de aplicarse.
 *
 * **Imponer.** Lo que el usuario corrige a mano mientras esto está puesto se
 * guarda para esa situación, y la próxima vez se usa lo suyo en lugar de lo de
 * fábrica. Así, quien lee de noche en sepia y no en negro solo tiene que
 * decirlo una vez.
 */

export const NIVELES = ['oscuro', 'tenue', 'interior', 'claro'];

/** Límite superior de cada nivel, en lux. */
const LIMITES = { oscuro: 8, tenue: 60, interior: 900 };

/** Margen de histéresis, en proporción del umbral. */
const MARGEN = 0.25;

/** Lo que hay que mantener un nivel nuevo antes de aplicarlo. */
export const ESPERA_MS = 3500;

const nivelSinMargen = (lux) => {
    if (lux < LIMITES.oscuro) return 'oscuro';
    if (lux < LIMITES.tenue) return 'tenue';
    if (lux < LIMITES.interior) return 'interior';
    return 'claro';
};

/**
 * Nivel de luz, con histéresis respecto al anterior.
 *
 * Desde un nivel solo se sale si la luz pasa el umbral **con margen**: con 8 lux
 * de límite entre oscuro y tenue, para subir hay que llegar a 10 y para volver
 * a bajar hay que caer de 6.
 */
export const nivelDe = (lux, anterior = null) => {
    const directo = nivelSinMargen(lux);
    if (!anterior || directo === anterior) return directo;

    const i = NIVELES.indexOf(anterior);
    const j = NIVELES.indexOf(directo);
    if (j > i) {
        const umbral = LIMITES[anterior];
        return lux >= umbral * (1 + MARGEN) ? directo : anterior;
    }
    const umbral = LIMITES[NIVELES[i - 1]];
    return lux < umbral * (1 - MARGEN) ? directo : anterior;
};

/** Media móvil en escala logarítmica. */
export const suavizar = (anterior, lux, peso = 0.3) => {
    const actual = Math.log10(Math.max(0.5, lux));
    if (anterior === null || anterior === undefined) return lux;
    const previo = Math.log10(Math.max(0.5, anterior));
    return 10 ** (previo + (actual - previo) * peso);
};

/**
 * Lo que propone la app para cada nivel cuando el usuario no ha dicho nada.
 *
 * `interior` devuelve lo que el usuario tenía al encender la función: es la luz
 * normal, y ahí lo que vale es lo suyo.
 */
const DE_FABRICA = {
    oscuro: { theme: 'warmnight', dim: 0.4, warm: 0.3 },
    tenue: { theme: 'night', dim: 0.15, warm: 0.15 },
    claro: { dim: 0, warm: 0 },
};

const TEMAS_CLAROS = new Set(['paper', 'cream', 'sepia', 'parchment', 'eink']);

/**
 * @param {string} nivel
 * @param {{ base: {theme: string, dim: number, warm: number}, aprendidos?: Object }} contexto
 */
export const ajustesPara = (nivel, { base, aprendidos = {} }) => {
    if (aprendidos[nivel]) return { ...aprendidos[nivel] };
    if (nivel === 'interior') return { ...base };
    if (nivel === 'claro') {
        // Con mucha luz, un tema oscuro se lee mal: el reflejo de la pantalla
        // se come el texto claro. Si el del usuario ya es claro, se respeta.
        return { ...DE_FABRICA.claro, theme: TEMAS_CLAROS.has(base.theme) ? base.theme : 'paper' };
    }
    return { ...DE_FABRICA[nivel] };
};

const NOMBRES = {
    oscuro: 'A oscuras',
    tenue: 'Poca luz',
    interior: 'Luz normal',
    claro: 'Mucha luz',
};

/** Texto del aviso que sale al cambiar. */
export const describir = (nivel, ajustes, nombreTema = (id) => id) => {
    const partes = [NOMBRES[nivel] || nivel];
    if (ajustes.theme) partes.push(nombreTema(ajustes.theme).toLowerCase());
    if (ajustes.dim > 0) partes.push(`brillo ${Math.round((1 - ajustes.dim) * 100)} %`);
    return partes.join(' · ');
};

/**
 * Convierte lecturas del sensor en cambios de nivel ya estables.
 *
 * @param {Object} opciones
 * @param {(nivel: string) => void} opciones.alCambiar
 * @param {number} [opciones.espera]
 */
export const createConfortLuz = ({ alCambiar, espera = ESPERA_MS }) => {
    let lux = null;
    let nivel = null;
    let candidato = null;
    let desde = 0;

    return {
        /** Una lectura del sensor. `ahora` se inyecta para poder probarlo. */
        leer(valor, ahora = Date.now()) {
            lux = suavizar(lux, valor);
            const propuesto = nivelDe(lux, nivel);

            // La primera lectura fija el nivel sin esperar: al abrir el libro a
            // oscuras, la página tiene que salir ya bien.
            if (nivel === null) {
                nivel = propuesto;
                alCambiar(nivel);
                return;
            }

            if (propuesto === nivel) {
                candidato = null;
                return;
            }
            if (propuesto !== candidato) {
                candidato = propuesto;
                desde = ahora;
                return;
            }
            if (ahora - desde >= espera) {
                nivel = candidato;
                candidato = null;
                alCambiar(nivel);
            }
        },
        nivel: () => nivel,
    };
};
