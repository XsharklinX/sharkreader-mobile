/**
 * Prosodia: las pausas que separan una lectura de un dictado.
 *
 * ## Por qué la voz sonaba robótica
 *
 * Tres cosas, y la primera es nuestra:
 *
 * **1. No había ninguna pausa.** El bucle de lectura pedía una frase, esperaba a
 * que terminara de sonar y pedía la siguiente **en el mismo instante**. Un motor
 * de voz no añade silencio por su cuenta al final de una frase: devuelve el
 * control en cuanto suena la última sílaba. El resultado es una tirada continua
 * sin respiración, que es exactamente lo que hace que algo suene a máquina
 * aunque la voz sea buena. Una persona leyendo se para medio segundo en un punto
 * y bastante más entre párrafos.
 *
 * **2. Se cogía la primera voz de la lista.** Android devuelve las voces sin
 * orden de calidad, y muchos dispositivos traen varias del mismo idioma con
 * calidades muy distintas —de `very-low` a `very-high`—. Se estaba usando la que
 * tocara.
 *
 * **3. El tono estaba fijo en 1.** No es un defecto de por sí, pero no permitía
 * corregir una voz que suena demasiado aguda o demasiado plana.
 *
 * Este módulo resuelve la primera, que es la que más se nota y la única que
 * dependía enteramente de nosotros.
 */

/**
 * Pausa que corresponde al final de un fragmento, en milisegundos.
 *
 * Los valores no son arbitrarios: salen de cómo se lee en voz alta. Una coma es
 * una inflexión, no una parada; un punto cierra una idea; un punto y aparte
 * cambia de asunto y pide bastante más. Los dos puntos y el guion de diálogo
 * anuncian algo, así que la pausa va **antes** de lo que viene, no después.
 *
 * A velocidades altas las pausas se acortan en proporción: quien lee a 2× no
 * quiere esperar el mismo medio segundo entre frases.
 *
 * @param {string} chunk  El fragmento que acaba de sonar.
 * @param {number} rate   Velocidad de lectura.
 * @returns {number} Milisegundos de silencio.
 */
export const pauseAfter = (chunk, rate = 1) => {
    const text = String(chunk || '').trimEnd();
    if (!text) return 0;

    const last = text.slice(-1);
    let base;

    if (/[.!?]/.test(last) || /[.!?][»"'”’)]$/.test(text)) {
        // Fin de idea.
        base = 420;
    } else if (last === ':' || last === ';') {
        // Anuncia lo que viene: pausa marcada pero no de cierre.
        base = 340;
    } else if (last === ',') {
        base = 180;
    } else if (/[—–]$/.test(text)) {
        // Raya de diálogo suelta al final: es una interrupción.
        base = 260;
    } else {
        // El troceador corta también por longitud, así que hay fragmentos que
        // acaban a mitad de frase. Ahí la pausa tiene que ser mínima o se oiría
        // un corte donde no hay ninguno.
        base = 70;
    }

    // A más velocidad, pausas más cortas — pero no proporcionales del todo: sin
    // suelo, a 2× desaparecen y se vuelve un dictado otra vez.
    const scaled = Math.round(base / Math.max(0.5, rate));
    return Math.max(50, scaled);
};

/**
 * Pausa extra al empezar un párrafo nuevo.
 *
 * Se detecta porque el fragmento anterior cerró idea y el nuevo empieza con
 * mayúscula o con raya de diálogo. No es perfecto —no tenemos la estructura del
 * documento en el troceador— pero acierta en la gran mayoría de los casos y el
 * coste de equivocarse es un silencio de más de un tercio de segundo.
 */
export const isParagraphBreak = (previous, next) => {
    const before = String(previous || '').trimEnd();
    const after = String(next || '').trimStart();
    if (!before || !after) return false;

    const closed = /[.!?][»"'”’)]?$/.test(before);
    const opens = /^[—–«"“(]/.test(after) || /^[A-ZÁÉÍÓÚÑÜ¿¡]/.test(after);
    return closed && opens;
};

export const PARAGRAPH_EXTRA_MS = 260;

/**
 * Silencio total entre dos fragmentos.
 *
 * @param {string} current  El que acaba de sonar.
 * @param {string} next     El que viene, o null si era el último.
 * @param {number} rate
 */
export const silenceBetween = (current, next, rate = 1) => {
    const base = pauseAfter(current, rate);
    if (!next) return base;
    const extra = isParagraphBreak(current, next)
        ? Math.round(PARAGRAPH_EXTRA_MS / Math.max(0.5, rate))
        : 0;
    return base + extra;
};

// ── Elección de voz ─────────────────────────────────────────────────────────

/**
 * Calidad declarada por Android, de peor a mejor.
 *
 * `Voice.getQuality()` devuelve una de estas cinco constantes. Android no
 * ordena la lista por calidad, así que en un móvil con tres voces españolas se
 * estaba cogiendo la que tocara — y podía ser la `very-low`.
 */
export const QUALITY_ORDER = ['very-low', 'low', 'normal', 'high', 'very-high'];

export const qualityRank = (quality) => {
    const index = QUALITY_ORDER.indexOf(String(quality || 'normal'));
    return index === -1 ? 2 : index;
};

/**
 * Ordena las voces por lo bien que van a sonar para un idioma dado.
 *
 * El criterio, en orden:
 *
 *  1. **El idioma del libro primero.** Una voz inglesa leyendo español es
 *     ininteligible, así que esto manda sobre todo lo demás.
 *  2. **Más calidad antes.**
 *  3. **Sin conexión antes que con conexión.** Las voces de red suenan mejor,
 *     pero fallan sin cobertura a mitad de capítulo y consumen datos leyendo un
 *     libro entero. Se ofrecen, pero no se eligen solas.
 *
 * @param {Array} voices
 * @param {string} lang  Idioma preferido, p. ej. 'es' o 'es-ES'.
 */
export const rankVoices = (voices = [], lang = 'es') => {
    const prefix = String(lang || '').slice(0, 2).toLowerCase();

    return voices.slice().sort((a, b) => {
        const aLang = String(a.lang || '').toLowerCase().startsWith(prefix) ? 0 : 1;
        const bLang = String(b.lang || '').toLowerCase().startsWith(prefix) ? 0 : 1;
        if (aLang !== bLang) return aLang - bLang;

        const quality = qualityRank(b.quality) - qualityRank(a.quality);
        if (quality !== 0) return quality;

        const aNet = a.network ? 1 : 0;
        const bNet = b.network ? 1 : 0;
        if (aNet !== bNet) return aNet - bNet;

        return String(a.name || '').localeCompare(String(b.name || ''));
    });
};

/** La mejor voz disponible para un idioma, o null si no hay ninguna. */
export const bestVoice = (voices = [], lang = 'es') => rankVoices(voices, lang)[0] || null;

/** Etiqueta legible de la calidad, para la lista de voces. */
export const QUALITY_LABELS = {
    'very-high': 'Excelente',
    high: 'Alta',
    normal: 'Normal',
    low: 'Baja',
    'very-low': 'Muy baja',
};
