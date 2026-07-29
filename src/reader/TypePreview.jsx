import React from 'react';
import { FONT_FAMILIES, READER_THEMES } from './typography.js';

/**
 * Muestra tipográfica en vivo.
 *
 * Estás componiendo texto y hasta ahora lo único que se veía era una «Aa» de
 * 22 px dentro del selector de tamaño. Cada cambio —interlineado, márgenes,
 * sangría, partición de palabras— había que confirmarlo cerrando la hoja,
 * mirando el libro y volviendo a abrirla.
 *
 * ## Por qué no es un iframe
 *
 * Lo honesto sería renderizar con epub.js para que la muestra fuera idéntica al
 * libro. Pero montar un segundo iframe con su propia paginación mientras el
 * primero está vivo cuesta memoria y medio segundo por cada toque en un botón
 * «+». Aquí se replican **las reglas que se ven en un párrafo** —familia,
 * cuerpo, interlineado, sangría, justificado, partición— y se deja fuera lo
 * único que no cabe en cuatro líneas: la paginación por columnas.
 *
 * El texto es un fragmento real, con palabras largas y una coma en mitad de la
 * segunda línea, para que se note la partición y el río del justificado. Un
 * «lorem ipsum» tiene una distribución de longitudes que no se parece a nada.
 */

const SAMPLE = 'Todos los hombres se sintieron señores de un tesoro intacto y '
    + 'secreto. No había problema personal o mundial cuya elocuente solución no '
    + 'existiera: en algún hexágono. El universo estaba justificado.';

const stackOf = (id) =>
    FONT_FAMILIES.find((font) => font.id === id)?.stack || FONT_FAMILIES[0].stack;

export default function TypePreview({ typography, theme }) {
    const palette = READER_THEMES[theme] || READER_THEMES.dark;
    const indented = typography.paragraphStyle === 'indent';

    // El modo dislexia manda sobre lo demás, igual que en el lector: si aquí no
    // se reflejara, la muestra prometería una composición que el libro no da.
    const dyslexia = Boolean(typography.dyslexia);

    return (
        <div
            className="type-preview"
            aria-label="Muestra del texto con los ajustes actuales"
            style={{
                background: palette.bg,
                color: palette.text,
                // Los márgenes de lectura se replican en proporción, no en
                // píxeles: la muestra mide un tercio del ancho de la pantalla y
                // 36 px de margen se la comerían entera.
                paddingLeft: `${Math.round(typography.margin * 0.5) + 12}px`,
                paddingRight: `${Math.round(typography.margin * 0.5) + 12}px`,
            }}
        >
            <p
                style={{
                    fontFamily: dyslexia
                        ? '"Atkinson Hyperlegible", Verdana, sans-serif'
                        : stackOf(typography.fontFamily),
                    fontSize: `${typography.fontSize}px`,
                    lineHeight: dyslexia
                        ? Math.max(typography.lineHeight, 1.9)
                        : typography.lineHeight,
                    letterSpacing: `${dyslexia ? Math.max(typography.letterSpacing, 1.2) : typography.letterSpacing}px`,
                    wordSpacing: dyslexia ? '0.16em' : 'normal',
                    textAlign: typography.justify && !dyslexia ? 'justify' : 'left',
                    textIndent: indented ? '1.4em' : 0,
                    hyphens: typography.hyphens && !dyslexia ? 'auto' : 'manual',
                    WebkitHyphens: typography.hyphens && !dyslexia ? 'auto' : 'manual',
                    fontWeight: typography.eink ? 500 : 400,
                    margin: 0,
                }}
                // La partición de palabras no funciona sin saber el idioma. Es
                // el mismo requisito que dentro del libro, y sin declararlo aquí
                // la muestra saldría con ríos que el libro no tiene.
                lang={typography.hyphenLang && typography.hyphenLang !== 'auto'
                    ? typography.hyphenLang
                    : 'es'}
            >
                {typography.dropCap && (
                    <span className="preview-cap">{SAMPLE[0]}</span>
                )}
                {typography.dropCap ? SAMPLE.slice(1) : SAMPLE}
            </p>
        </div>
    );
}
