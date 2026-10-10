import ePub from 'epubjs';

/**
 * Dónde está cada subrayado traído de otra app, como posición de este libro.
 *
 * Kindle guarda «posición 170-172» y KOReader una ruta XPath: ninguna de las dos
 * sirve aquí. Lo que sí viaja es **el texto subrayado**, así que se busca ese
 * texto en el libro y de ahí sale la posición (CFI).
 *
 * El libro se abre sin pintarlo, capítulo a capítulo, y se descarga cada uno al
 * terminar: un libro de 600 páginas no tiene que estar entero en memoria.
 *
 * Si un texto no aparece tal cual —el libro parte la frase con saltos de línea,
 * o es otra edición— se prueba con un trozo más corto del principio. Lo que no
 * se encuentra no se pierde: va a las notas del libro.
 */

const normalizar = (texto) => String(texto || '').replace(/\s+/g, ' ').trim();

/** Agujas de más larga a más corta: la primera que aparezca gana. */
export const agujasDe = (texto) => {
    const limpio = normalizar(texto);
    const agujas = [limpio.slice(0, 220), limpio.slice(0, 80), limpio.slice(0, 40)];
    return [...new Set(agujas.filter((a) => a.length >= 12))];
};

/**
 * @param {Blob} blob el EPUB
 * @param {Array<{texto: string}>} subrayados
 * @param {(hechos: number, total: number) => void} [alAvanzar]
 * @returns {Promise<Array<{texto: string, cfi: string|null}>>}
 */
export const colocarSubrayados = async (blob, subrayados, alAvanzar) => {
    const resultado = subrayados.map((s) => ({ ...s, cfi: null }));
    if (!resultado.some((s) => s.texto)) return resultado;

    const libro = ePub(await blob.arrayBuffer());
    try {
        await libro.ready;
        const capitulos = libro.spine.spineItems || [];
        for (let i = 0; i < capitulos.length; i += 1) {
            if (resultado.every((s) => s.cfi || !s.texto)) break;
            const capitulo = capitulos[i];
            try {
                await capitulo.load(libro.load.bind(libro));
                for (const s of resultado) {
                    if (s.cfi || !s.texto) continue;
                    for (const aguja of agujasDe(s.texto)) {
                        const encontrado = capitulo.search(aguja, 12)?.[0];
                        if (encontrado?.cfi) { s.cfi = encontrado.cfi; break; }
                    }
                }
            } catch {
                // Un capítulo ilegible no impide buscar en los demás.
            } finally {
                capitulo.unload();
            }
            alAvanzar?.(i + 1, capitulos.length);
        }
    } finally {
        libro.destroy();
    }
    return resultado;
};
