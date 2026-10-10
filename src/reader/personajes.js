/**
 * Personajes y lugares de un libro, sin destripes.
 *
 * ## Para qué
 *
 * En una novela larga aparece un nombre y no recuerdas quién era. Buscarlo no
 * sirve: la búsqueda enseña también las apariciones de después, y el tercer
 * resultado puede ser su muerte. Kindle lo resuelve con X-Ray, pero solo con los
 * libros de su tienda. Esto funciona con cualquier EPUB y sin internet.
 *
 * ## Cómo se encuentran
 *
 * Sin modelos ni servidores: un nombre propio es una palabra con mayúscula que
 * **no** está al principio de una frase, y que se repite. Se juntan las que van
 * seguidas («Sancho Panza»), con sus conectores («Dulcinea del Toboso») y sus
 * tratamientos («Don Quijote», «Mrs. Bennet»). Las palabras con mayúscula al
 * principio de frase se cuentan solo si el mismo nombre aparece también en mitad
 * de alguna.
 *
 * Después se unen variantes: «Sancho» va con «Sancho Panza» si no hay otro
 * «Sancho» con quien confundirlo.
 *
 * ## Personaje o lugar
 *
 * Por lo que suele ir delante. «en la Mancha», «hacia Barcelona», «desde el
 * Toboso»: un nombre que va casi siempre tras «en», «hacia», «desde» o «a» es un
 * sitio. No acierta siempre —«a Sancho» también existe—, por eso pide mayoría.
 *
 * ## Sin destripes
 *
 * Todo se cuenta por capítulo. La pantalla solo enseña lo de los capítulos ya
 * leídos y, del actual, hasta el punto por el que vas.
 */

/** Se sube al cambiar cómo se cuenta, para recalcular lo guardado. */
export const VERSION_PERSONAJES = 1;

const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'van', 'von', 'da', 'di', 'du', 'le', 'of', 'the', 'el', 'y']);
const TRATAMIENTOS = new Set([
    'don', 'doña', 'señor', 'señora', 'señorita', 'sr', 'sra', 'srta', 'fray', 'sor', 'padre', 'madre',
    'tío', 'tía', 'capitán', 'doctor', 'doctora', 'rey', 'reina', 'príncipe', 'princesa', 'lord', 'lady',
    'sir', 'mr', 'mrs', 'miss', 'ms', 'dr', 'saint', 'san', 'santa', 'master', 'madame', 'monsieur',
]);

/**
 * Palabras con mayúscula que no son nombres aunque se repitan en mitad de una
 * frase: días, meses, tratamientos sueltos, interjecciones y lo que la
 * tipografía de muchos libros pone en mayúscula.
 */
const NO_NOMBRES = new Set([
    'yo', 'él', 'ella', 'usted', 'ustedes', 'dios', 'señor', 'señora', 'don', 'doña',
    'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo',
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
    'i', 'mr', 'mrs', 'miss', 'sir', 'lady', 'lord', 'god', 'oh', 'ah', 'eh', 'ay', 'capítulo', 'chapter', 'parte', 'part', 'libro', 'book',
    'the', 'a', 'an', 'el', 'la', 'los', 'las', 'un', 'una', 'y', 'pero', 'and', 'but',
]);

const PREPOSICIONES_DE_LUGAR = new Set(['en', 'hacia', 'desde', 'hasta', 'a', 'por', 'in', 'at', 'to', 'from', 'into', 'towards']);
/** «la Mancha», «el Toboso»: en español un artículo delante casi siempre es un sitio. */
const ARTICULOS = new Set(['la', 'el', 'los', 'las', 'the']);

/**
 * Texto de un capítulo con los párrafos separados por saltos de línea.
 *
 * `extractText` de la búsqueda los une con un espacio, y aquí eso es un
 * problema: el primer «Pues» de un párrafo que sigue a un verso sin punto
 * parecería ir en mitad de una frase, y «Mancha» + «Con» del verso siguiente
 * parecerían un nombre de dos palabras.
 */
export const textoConParrafos = (html) => String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|td|tr|section|blockquote)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t\r\f]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();

/** Cuántas veces sale cada palabra **en minúscula** en todo el libro. */
const frecuenciaEnMinuscula = (textos) => {
    const cuenta = new Map();
    for (const texto of textos) {
        for (const m of String(texto || '').matchAll(/(?<![\p{L}])\p{Ll}[\p{L}'’-]*/gu)) {
            cuenta.set(m[0], (cuenta.get(m[0]) || 0) + 1);
        }
    }
    return cuenta;
};

const minusculas = (texto) => texto.toLocaleLowerCase('es');
const esMayuscula = (palabra) => /^\p{Lu}[\p{Ll}\p{Lu}'’-]*$/u.test(palabra) && /\p{Ll}/u.test(palabra);

/**
 * Las apariciones de nombres propios en un texto.
 *
 * @returns {Array<{nombre: string, inicio: boolean, previa: string, posicion: number}>}
 */
export const nombresEnTexto = (texto) => {
    const salida = [];
    // Palabras con su posición, y si empiezan frase.
    const palabras = [];
    // La coma y los paréntesis separan (en «Fernando, Cardenio y Luscinda» son
    // tres nombres) pero no empiezan frase.
    const patron = /[\p{L}'’-]+|[.!?¿¡«»"“”:;—–\n,()[\]]/gu;
    let inicioDeFrase = true;
    for (const m of String(texto || '').matchAll(patron)) {
        const token = m[0];
        if (/^[.!?¿¡«»"“”:;—–\n,()[\]]$/.test(token)) {
            if (/[.!?¿¡«"“:—–\n]/.test(token)) inicioDeFrase = true;
            palabras.push(null);
            continue;
        }
        palabras.push({ texto: token.replace(/^['’-]+|['’-]+$/g, ''), inicio: inicioDeFrase, posicion: m.index });
        inicioDeFrase = false;
    }

    for (let i = 0; i < palabras.length; i += 1) {
        const p = palabras[i];
        if (!p || !esMayuscula(p.texto)) continue;
        if (i > 0 && palabras[i - 1] && esMayuscula(palabras[i - 1].texto)) continue; // ya dentro de otro

        const partes = [p.texto];
        let j = i + 1;
        while (j < palabras.length && palabras[j]) {
            const siguiente = palabras[j].texto;
            if (esMayuscula(siguiente)) { partes.push(siguiente); j += 1; continue; }
            // Un conector solo cuenta si detrás viene otra mayúscula y no es «y»
            // —«Sancho y Quijote» son dos—.
            const tras = palabras[j + 1];
            if (CONECTORES.has(minusculas(siguiente)) && minusculas(siguiente) !== 'y' && tras && esMayuscula(tras.texto)) {
                partes.push(siguiente, tras.texto);
                j += 2;
                continue;
            }
            break;
        }

        // Un tratamiento suelto («Señor») no es un nombre; con algo detrás sí.
        while (partes.length > 1 && CONECTORES.has(minusculas(partes[partes.length - 1]))) partes.pop();
        const nombre = partes.join(' ');
        if (/gutenberg|archive foundation|calibre|creative commons/i.test(nombre)) continue;
        const primera = minusculas(partes[0]).replace(/\.$/, '');
        if (partes.length === 1 && (NO_NOMBRES.has(primera) || TRATAMIENTOS.has(primera))) continue;
        if (nombre.length < 2) continue;

        const previa = i > 0 && palabras[i - 1] ? minusculas(palabras[i - 1].texto) : '';
        const anterior = i > 1 && palabras[i - 1] && palabras[i - 2] ? minusculas(palabras[i - 2].texto) : '';
        salida.push({ nombre, inicio: p.inicio, previa, anterior, posicion: p.posicion });
        i = j - 1;
    }
    return salida;
};

/**
 * Cuenta los nombres de todo el libro, capítulo a capítulo.
 *
 * @param {string[]} capitulos texto de cada capítulo, en orden de lectura
 * @returns {Array<{nombre: string, tipo: 'personaje'|'lugar', porCapitulo: number[], total: number, primero: number}>}
 */
export const analizarLibro = (capitulos = [], { minimo = 3, maximo = 80 } = {}) => {
    const enMinuscula = frecuenciaEnMinuscula(capitulos);
    /** ¿Esta palabra es, en este libro, sobre todo una palabra corriente? */
    const corriente = (palabra, vecesComoNombre) => (enMinuscula.get(minusculas(palabra)) || 0) >= Math.max(2, vecesComoNombre * 0.5);

    const datos = new Map();
    capitulos.forEach((texto, capitulo) => {
        for (const aparicion of nombresEnTexto(texto)) {
            let d = datos.get(aparicion.nombre);
            if (!d) {
                d = { nombre: aparicion.nombre, porCapitulo: new Array(capitulos.length).fill(0), enMedio: 0, lugar: 0, total: 0 };
                datos.set(aparicion.nombre, d);
            }
            d.porCapitulo[capitulo] += 1;
            d.total += 1;
            if (!aparicion.inicio) d.enMedio += 1;
            const tras = ARTICULOS.has(aparicion.previa) ? aparicion.anterior : aparicion.previa;
            if (PREPOSICIONES_DE_LUGAR.has(tras) || ARTICULOS.has(aparicion.previa)) d.lugar += 1;
        }
    });

    let lista = [...datos.values()].filter((d) => {
        // Una palabra que casi siempre va al principio de frase es una palabra
        // normal en mayúscula: «Entonces», «Mucho».
        if (d.enMedio === 0 || (d.enMedio < 3 && d.enMedio / d.total < 0.2)) return false;
        const partes = d.nombre.split(' ');
        // «Pues», «Así», «Todo»: en el libro salen mil veces en minúscula.
        if (partes.length === 1 && corriente(d.nombre, d.total)) return false;
        // «Mancha Con»: la última palabra de un nombre largo no puede ser una
        // palabra corriente.
        if (partes.length > 1 && corriente(partes[partes.length - 1], d.total)) return false;
        // Lo que sale una o dos veces no llega a la lista, y quitarlo aquí deja
        // las uniones de abajo con cientos de candidatos en vez de miles.
        return d.total >= Math.min(2, minimo);
    });

    // «Sancho Dorotea»: dos nombres que coincidieron juntos una vez. Si cada
    // palabra existe suelta con mucho más peso que la pareja, la pareja es una
    // casualidad. Y un nombre largo con muy pocas apariciones no se queda con
    // las de nadie: se descarta antes de unir variantes.
    const sueltos = new Map(lista.filter((d) => !d.nombre.includes(' ')).map((d) => [d.nombre, d.total]));
    lista = lista.filter((d) => {
        if (!d.nombre.includes(' ')) return true;
        if (d.total < minimo) return false;
        const propias = d.nombre.split(' ').filter((p) => !CONECTORES.has(minusculas(p)) && !TRATAMIENTOS.has(minusculas(p)));
        return !(propias.length > 1 && propias.every((p) => (sueltos.get(p) || 0) > d.total * 3));
    });

    const fundir = (destino, origen) => {
        origen.porCapitulo.forEach((n, i) => { destino.porCapitulo[i] += n; });
        destino.total += origen.total;
        destino.enMedio += origen.enMedio;
        destino.lugar += origen.lugar;
    };

    // «Don Quijote de la Mancha» es «Don Quijote»: un nombre largo que empieza
    // por otro nombre de la lista se suma al corto.
    const porLargo = [...lista].sort((a, b) => b.nombre.length - a.nombre.length);
    const absorbidos = new Set();
    for (const largo of porLargo) {
        const corto = lista.find((d) => d !== largo && !absorbidos.has(d.nombre)
            && d.nombre.includes(' ') && largo.nombre.startsWith(`${d.nombre} `));
        if (!corto) continue;
        fundir(corto, largo);
        absorbidos.add(largo.nombre);
    }
    lista = lista.filter((d) => !absorbidos.has(d.nombre));

    // «Sancho» se suma a «Sancho Panza». Si hay varios nombres largos que lo
    // contienen, solo al que domina claramente: con dos «Sancho» distintos con
    // el mismo peso no se puede saber de cuál se habla.
    const largos = lista.filter((d) => d.nombre.includes(' '));
    for (const corto of lista.filter((d) => !d.nombre.includes(' '))) {
        const dueños = largos
            .filter((largo) => largo.nombre.split(' ').includes(corto.nombre))
            .sort((a, b) => b.total - a.total);
        if (!dueños.length) continue;
        if (dueños.length > 1 && dueños[0].total < dueños[1].total * 3) continue;
        fundir(dueños[0], corto);
        absorbidos.add(corto.nombre);
    }
    lista = lista.filter((d) => !absorbidos.has(d.nombre));

    return lista
        .filter((d) => d.total >= minimo)
        .sort((a, b) => b.total - a.total)
        .slice(0, maximo)
        .map((d) => ({
            nombre: d.nombre,
            tipo: d.lugar / d.total > 0.5 ? 'lugar' : 'personaje',
            porCapitulo: d.porCapitulo,
            total: d.total,
            primero: d.porCapitulo.findIndex((n) => n > 0),
        }));
};

/**
 * Lo que se puede enseñar sin destripar: solo hasta donde vas.
 *
 * @param {ReturnType<typeof analizarLibro>} analisis
 * @param {number} capitulo índice del capítulo actual
 * @param {number} [cuentaActual] apariciones de cada nombre en el capítulo
 *   actual **hasta la posición de lectura**, por nombre. Sin ella, el capítulo
 *   actual no cuenta.
 */
export const hastaAqui = (analisis = [], capitulo = 0, cuentaActual = {}) => analisis
    .map((d) => {
        const anteriores = d.porCapitulo.slice(0, Math.max(0, capitulo)).reduce((a, b) => a + b, 0);
        const total = anteriores + (cuentaActual[d.nombre] || 0);
        const porCapitulo = d.porCapitulo.slice(0, Math.max(0, capitulo + 1)).map((n, i) => (
            i === capitulo ? (cuentaActual[d.nombre] || 0) : n
        ));
        return { ...d, total, porCapitulo };
    })
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total);

/**
 * Cuántas veces sale cada nombre en un trozo de texto (el capítulo actual hasta
 * la posición), incluidas las variantes que se unieron al analizar.
 */
export const contarEn = (texto, nombres = []) => {
    const cuenta = {};
    const apariciones = nombresEnTexto(texto);
    for (const nombre of nombres) {
        const partes = nombre.split(' ');
        cuenta[nombre] = apariciones.filter((a) => a.nombre === nombre
            || (!a.nombre.includes(' ') && partes.includes(a.nombre))).length;
    }
    return cuenta;
};

/**
 * Frases donde sale un nombre, para la ficha. Solo de los capítulos ya leídos.
 *
 * @param {string[]} capitulos textos, el actual ya recortado a la posición
 * @returns {Array<{capitulo: number, frase: string}>}
 */
export const frasesCon = (capitulos = [], nombre, { maximo = 6 } = {}) => {
    const partes = nombre.split(' ');
    const claves = [nombre, ...partes.filter((p) => p.length > 2 && !CONECTORES.has(minusculas(p)) && !TRATAMIENTOS.has(minusculas(p)))];
    const salida = [];
    capitulos.forEach((texto, capitulo) => {
        const frases = String(texto || '').split(/(?<=[.!?…])\s+/);
        for (const frase of frases) {
            if (claves.some((clave) => new RegExp(`(^|[^\\p{L}])${clave}([^\\p{L}]|$)`, 'u').test(frase))) {
                salida.push({ capitulo, frase: frase.trim().slice(0, 220) });
            }
        }
    });
    if (salida.length <= maximo) return salida;
    // La primera aparición y las más recientes: quién es y qué ha pasado últimamente.
    return [salida[0], ...salida.slice(-(maximo - 1))];
};
