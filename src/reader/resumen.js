/**
 * Lo que ha pasado hasta aquí.
 *
 * ## Dos formas de resumir
 *
 *  1. **Con la IA del teléfono** (Gemini Nano, `SharkResumenPlugin.java`), en
 *     los móviles que la traen. Solo resume en inglés, japonés y coreano; para
 *     cualquier otro idioma, el texto se pasa al inglés con la traducción del
 *     teléfono, se resume, y el resumen vuelve al idioma del usuario. Nada sale
 *     del teléfono en ningún paso.
 *  2. **Frases clave**, en todos los demás: de cada capítulo, las frases que
 *     mejor lo representan. No es un resumen escrito, es una selección, y la
 *     pantalla lo dice.
 *
 * ## Sin destripes
 *
 * Se resumen los capítulos ya leídos y, del actual, solo hasta la página en la
 * que vas.
 *
 * Aquí está la parte pura: elegir frases y preparar el texto para la IA.
 */

const VACIAS = new Set(`de la que el en y a los se del las un por con no una su para es al lo como más pero sus le ya o
fue este ha sí porque esta son entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos
uno les ni contra otros ese eso ante ellos e esto mí antes algunos qué unos yo otro otras otra él tanto esa estos mucho
quienes nada muchos cual poco ella estar estas algunas algo nosotros mi mis tú te ti tu tus ellas nosotras vosotros
vosotras os mío mía míos mías tuyo tuya suyo suya nuestro nuestra vuestro vuestra esos esas estoy estás está estamos
estáis están era eras éramos eran había habían ser sido siendo tenía tenían dijo así entonces aunque the of and to in
that was his he it with as her had for she not but be they at on is you i my me we him this from by were said what all
there so an have which them their would one no if out up when been or do could who into then`.split(/\s+/));

const palabras = (texto) => String(texto || '').toLocaleLowerCase('es').match(/\p{L}+/gu) || [];

/** Frases de un texto, sin las demasiado cortas para decir algo. */
export const frasesDe = (texto) => String(texto || '')
    .replace(/\s*\n\s*/g, ' ')
    .split(/(?<=[.!?…»])\s+(?=[«"—\p{Lu}¿¡])/u)
    .map((f) => f.trim())
    .filter((f) => palabras(f).length >= 6);

/**
 * Las frases que mejor representan un capítulo, en el orden en que aparecen.
 *
 * Cada frase puntúa por las palabras del capítulo que más se repiten —lo que
 * importa en él— y por los personajes que nombra. Se penalizan las líneas de
 * diálogo sueltas y las frases kilométricas, que como resumen no se entienden.
 *
 * @param {string} texto
 * @param {{maximo?: number, nombres?: string[]}} [opciones]
 */
export const frasesClave = (texto, { maximo = 3, nombres = [] } = {}) => {
    const frases = frasesDe(texto);
    if (frases.length <= maximo) return frases;

    const frecuencia = new Map();
    for (const p of palabras(texto)) {
        if (p.length < 3 || VACIAS.has(p)) continue;
        frecuencia.set(p, (frecuencia.get(p) || 0) + 1);
    }

    const puntuadas = frases.map((frase, posicion) => {
        const suyas = palabras(frase).filter((p) => p.length >= 3 && !VACIAS.has(p));
        const unicas = [...new Set(suyas)];
        let nota = unicas.reduce((suma, p) => suma + Math.log1p(frecuencia.get(p) || 0), 0) / Math.sqrt(Math.max(4, suyas.length));
        nota += nombres.filter((n) => frase.includes(n)).length * 0.8;
        if (/^[—–-]/.test(frase)) nota *= 0.6;
        // Una frase de cuarenta palabras significativas no se lee como resumen.
        if (suyas.length > 30) nota *= 0.45;
        return { frase, posicion, nota };
    });

    return puntuadas
        .sort((a, b) => b.nota - a.nota)
        .slice(0, maximo)
        .sort((a, b) => a.posicion - b.posicion)
        .map((p) => p.frase);
};

/**
 * Recorta un texto largo para la IA del teléfono, que admite unas 3.000
 * palabras: se queda con el principio y con el final, que es donde un capítulo
 * presenta y resuelve.
 */
export const recortarParaResumen = (texto, maximoPalabras = 2600) => {
    const lista = String(texto || '').split(/\s+/).filter(Boolean);
    if (lista.length <= maximoPalabras) return lista.join(' ');
    const mitad = Math.floor(maximoPalabras / 2);
    return `${lista.slice(0, mitad).join(' ')} … ${lista.slice(-mitad).join(' ')}`;
};

/** Las viñetas que devuelve el modelo, sin los asteriscos ni guiones. */
export const vinetasDe = (resumen) => String(resumen || '')
    .split(/\n+/)
    .map((l) => l.replace(/^\s*[*•\-–]\s*/, '').trim())
    .filter(Boolean);
