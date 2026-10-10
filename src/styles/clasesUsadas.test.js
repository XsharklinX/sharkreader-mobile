import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Toda clase que se usa tiene que existir en alguna hoja de estilos.
 *
 * ## Por qué existe esta prueba
 *
 * `.reader-tools` se escribía en el JSX del lector de PDF y del de cómic, y **no
 * tenía ni una regla en ninguna hoja**. Dentro de una columna, sus botones
 * —que son `display: grid`, así que ocupan toda la línea— se apilaban uno debajo
 * de otro: la barra salía como una tira vertical de iconos que llenaba media
 * pantalla y no dejaba sitio ni para la página.
 *
 * Llevaba así desde siempre. Había casi mil pruebas y ninguna podía verlo,
 * porque todas comprueban **comportamiento** y esto es maquetación: el
 * componente se monta, responde a los clics y devuelve el árbol correcto. Lo que
 * estaba mal es que ese árbol no tenía aspecto.
 *
 * Se descubrió abriendo un PDF en el teléfono, semanas después.
 *
 * ## Qué comprueba y qué no
 *
 * No comprueba que la hoja esté **bien**: comprueba que existe. Es el único lado
 * de este problema que se puede automatizar, y es justo el lado que falló — no
 * una regla mal puesta, sino ninguna regla.
 *
 * Solo mira las clases escritas literalmente. Una clase compuesta en tiempo de
 * ejecución no se puede resolver leyendo el fichero, y adivinarla daría avisos
 * falsos que acabarían con la prueba desactivada.
 */

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** Clases que no llevan estilo propio a propósito. */
const SIN_ESTILO = new Set([
    // Marcas que se ponen dentro del iframe del libro, con reglas inyectadas
    // desde `typography.js` y no desde las hojas de la app.
    'sr-hang-quote',
    'sr-hang-dash',
    'sr-ya-capitular',
]);

const ficheros = (dir, ext, salida = []) => {
    for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) ficheros(ruta, ext, salida);
        else if (ext.some((e) => nombre.endsWith(e))) salida.push(ruta);
    }
    return salida;
};

/** Las clases escritas literalmente en el JSX. */
const clasesEnJsx = () => {
    const usadas = new Map();

    for (const ruta of ficheros(RAIZ, ['.jsx'])) {
        const texto = readFileSync(ruta, 'utf8');

        // `className="a b c"` y los trozos estáticos de `className={`a ${x}`}`.
        for (const m of texto.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
            const crudo = (m[1] || m[2] || '')
                // Lo interpolado se quita **con lo que lleve pegado**: en
                // `fit-${modo}` la clase real es `fit-ancho`, y quedarse con el
                // trozo `fit-` daría un aviso por una clase que no existe.
                .replace(/[a-z0-9-]*\$\{[^}]*\}[a-z0-9-]*/gi, ' ');

            for (const clase of crudo.split(/\s+/)) {
                if (!clase || !/^[a-z][a-z0-9-]*$/i.test(clase)) continue;
                if (!usadas.has(clase)) usadas.set(clase, ruta);
            }
        }
    }

    return usadas;
};

/** Las clases que aparecen en algún selector de alguna hoja. */
const clasesEnCss = () => {
    const definidas = new Set();
    for (const ruta of ficheros(join(RAIZ, 'styles'), ['.css'])) {
        const texto = readFileSync(ruta, 'utf8')
            // Los comentarios mencionan clases que no siempre existen.
            .replace(/\/\*[\s\S]*?\*\//g, ' ');
        for (const m of texto.matchAll(/\.([a-z][a-z0-9-]*)/gi)) definidas.add(m[1]);
    }
    return definidas;
};

describe('las clases del JSX tienen estilos', () => {
    it('ninguna clase se queda sin una sola regla', () => {
        const usadas = clasesEnJsx();
        const definidas = clasesEnCss();

        const huerfanas = [...usadas.entries()]
            .filter(([clase]) => !definidas.has(clase) && !SIN_ESTILO.has(clase))
            .map(([clase, ruta]) => `${clase} (${ruta.split(/[\\/]/).slice(-2).join('/')})`);

        expect(huerfanas, 'clases usadas sin ninguna regla CSS').toEqual([]);
    });

    it('la prueba encuentra de verdad las clases, no está mirando a la nada', () => {
        // Una comprobación de la comprobación: si los patrones dejaran de
        // encontrar nada, la de arriba pasaría siempre y no valdría para nada.
        expect(clasesEnJsx().size).toBeGreaterThan(80);
        expect(clasesEnCss().size).toBeGreaterThan(80);
    });

    it('sabría ver el fallo que la hizo necesaria', () => {
        // `.reader-tools` es el caso real: existía en el JSX y no en el CSS.
        expect(clasesEnCss().has('reader-tools')).toBe(true);
    });
});
