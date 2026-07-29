import { READER_THEMES } from './typography.js';

/**
 * Imagen de cita compartible.
 *
 * Seleccionas una frase y sale un PNG con la portada, el título y la paleta del
 * tema de lectura. Es la única función de la app que trae usuarios en lugar de
 * retenerlos: cada cita compartida lleva la marca puesta.
 *
 * Se dibuja en un canvas y no con html2canvas: el resultado tiene que ser
 * idéntico en cualquier dispositivo, y el texto de la cita necesita un ajuste de
 * tamaño según su longitud que es más fácil de controlar midiendo a mano.
 */

const WIDTH = 1080;
const HEIGHT = 1350; // 4:5, la proporción que menos recorta en redes

/** Parte el texto en líneas que quepan en el ancho dado. */
const wrapText = (context, text, maxWidth) => {
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';

    words.forEach((word) => {
        const candidate = line ? `${line} ${word}` : word;
        if (context.measureText(candidate).width > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    });

    if (line) lines.push(line);
    return lines;
};

/**
 * El tamaño de letra se elige por longitud: una cita corta luce grande y una
 * larga tiene que caber. Sin esto, una cita de tres líneas queda ridícula al
 * lado de una de quince.
 */
const fontSizeFor = (length) => {
    if (length < 90) return 68;
    if (length < 180) return 56;
    if (length < 320) return 46;
    if (length < 500) return 38;
    return 32;
};

const loadImage = (src) => new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
});

/**
 * @param {Object} options
 * @param {string} options.text  La cita.
 * @param {Object} options.book
 * @param {string} options.theme Id del tema de lectura, para heredar su paleta.
 * @returns {Promise<Blob>}
 */
export const renderQuoteImage = async ({ text, book, theme = 'dark' }) => {
    const palette = READER_THEMES[theme] || READER_THEMES.dark;
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');

    // Fondo con un degradado suave a partir del color del tema, para que la
    // imagen no sea un rectángulo plano.
    const gradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, palette.bg);
    gradient.addColorStop(1, mix(palette.bg, palette.text, 0.12));
    context.fillStyle = gradient;
    context.fillRect(0, 0, WIDTH, HEIGHT);

    const margin = 96;
    const quote = String(text || '').trim();
    const size = fontSizeFor(quote.length);

    context.font = `italic ${size}px Georgia, serif`;
    context.fillStyle = palette.text;
    context.textBaseline = 'top';

    const lines = wrapText(context, `«${quote}»`, WIDTH - margin * 2);
    const lineHeight = size * 1.5;
    const blockHeight = lines.length * lineHeight;

    // La cita se centra verticalmente dejando sitio abajo para el pie.
    const footerHeight = 260;
    let y = Math.max(margin + 60, (HEIGHT - footerHeight - blockHeight) / 2);

    lines.forEach((line) => {
        context.fillText(line, margin, y);
        y += lineHeight;
    });

    // Filo de acento a la izquierda de la cita
    context.fillStyle = palette.link;
    context.fillRect(margin - 28, Math.max(margin + 60, (HEIGHT - footerHeight - blockHeight) / 2), 6, blockHeight);

    // ── Pie: portada, título y autor ──
    const footerY = HEIGHT - footerHeight + 40;
    const cover = await loadImage(book?.coverUrl || book?.coverBase64);

    let textX = margin;
    if (cover) {
        const coverHeight = 150;
        const coverWidth = Math.round(coverHeight * (cover.width / cover.height || 0.66));
        context.save();
        context.shadowColor = 'rgba(0,0,0,.4)';
        context.shadowBlur = 24;
        context.shadowOffsetY = 8;
        context.drawImage(cover, margin, footerY, coverWidth, coverHeight);
        context.restore();
        textX = margin + coverWidth + 32;
    }

    context.font = `600 40px Georgia, serif`;
    context.fillStyle = palette.text;
    const title = wrapText(context, book?.name || '', WIDTH - textX - margin)[0] || '';
    context.fillText(title, textX, footerY + 12);

    context.font = `28px system-ui, sans-serif`;
    context.fillStyle = mix(palette.text, palette.bg, 0.42);
    context.fillText(book?.author || '', textX, footerY + 68);

    // Marca discreta abajo
    context.font = `500 24px system-ui, sans-serif`;
    context.fillStyle = mix(palette.text, palette.bg, 0.6);
    context.fillText('SharkReader', margin, HEIGHT - 72);

    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
};

/** Mezcla dos colores hex. `amount` 0 devuelve el primero, 1 el segundo. */
const mix = (a, b, amount) => {
    const parse = (hex) => {
        const clean = hex.replace('#', '');
        const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
        return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16));
    };
    try {
        const [r1, g1, b1] = parse(a);
        const [r2, g2, b2] = parse(b);
        const channel = (x, y) => Math.round(x + (y - x) * amount);
        return `rgb(${channel(r1, r2)}, ${channel(g1, g2)}, ${channel(b1, b2)})`;
    } catch {
        return a;
    }
};

export { wrapText, fontSizeFor };
