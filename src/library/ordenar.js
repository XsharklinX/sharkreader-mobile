import { UNKNOWN_AUTHOR_FALLBACK } from '../core/bookModel.js';
import { detectSeriesCandidates } from '../core/seriesDetection.js';
import { cleanTitle } from './metadata.js';

/**
 * La biblioteca se ordena sola.
 *
 * ## El problema
 *
 * Importar doscientos libros de una carpeta deja la estantería llena de
 * «libro(1).epub», «9788497592208.pdf» y «dune_v2_FINAL», sin portada y con
 * «Autor desconocido». Arreglarlo era libro a libro desde su ficha, que nadie
 * hace con doscientos.
 *
 * ## Lo que hace
 *
 * Revisa toda la biblioteca de una vez y **propone** cambios: nunca los aplica
 * sin que el usuario los vea. Hay dos clases de arreglo:
 *
 *  - **Sin internet:** limpiar el título que viene del nombre del fichero y
 *    agrupar series. Se calcula en el teléfono con lo que ya hay.
 *  - **Con OpenLibrary:** título, autor y portada. Solo si el usuario lo pide,
 *    porque supone enviar los títulos de su biblioteca a un servicio de fuera.
 *
 * ## La regla que manda: antes nada que un dato equivocado
 *
 * Un libro con el título feo se reconoce igual. Un libro con la portada y el
 * autor **de otro libro** es peor que antes, y además engaña. Por eso un
 * resultado de OpenLibrary solo se acepta si su título se parece de verdad al
 * buscado; en la duda, ese libro se queda como estaba.
 *
 * Todo lo de aquí es puro: la red entra por parámetro.
 */

/** Palabras que delatan un nombre de fichero y no un título. */
const RUIDO = /\b(copia|copy|final|retail|ebook|epub|pdf|scan|escaneado|v\d+|ed\.?\s?digital|www\.\S+)\b/gi;

const sinAcentos = (texto) => String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const palabras = (texto) => sinAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/)
    .filter((palabra) => palabra.length > 1);

/**
 * ¿Este título parece sacado del nombre del fichero?
 *
 * No juzga si el título es bonito: solo detecta las marcas que deja un fichero
 * —extensión, guiones bajos, un ISBN, «(1)», «copia»—. Un título real en
 * minúsculas, o muy largo, no es asunto de esto.
 */
export const tituloSospechoso = (titulo) => {
    const texto = String(titulo || '').trim();
    if (!texto) return true;
    if (/^(libro sin t[ií]tulo|untitled|unknown|sin t[ií]tulo|desconocido)$/i.test(texto)) return true;
    if (/\.(epub|pdf|cbz|cbr|mobi|azw3?|txt|docx?|fb2)$/i.test(texto)) return true;
    if (texto.includes('_')) return true;
    if (/^[\d\s-]{9,}[\dxX]?$/.test(texto)) return true;
    if (/\(\d+\)\s*$/.test(texto)) return true;
    // «el-nombre-del-viento»: palabras unidas con guiones y sin un espacio.
    if (!/\s/.test(texto) && /^[\p{L}\d]+(-[\p{L}\d]+){2,}$/u.test(texto)) return true;
    RUIDO.lastIndex = 0;
    return RUIDO.test(texto);
};

/** ¿El autor es el relleno que se pone cuando el fichero no lo trae? */
export const autorDesconocido = (autor) => {
    const texto = String(autor || '').trim();
    return !texto
        || texto === UNKNOWN_AUTHOR_FALLBACK
        || /^(unknown|desconocido|anonymous|an[oó]nimo|autor)$/i.test(texto);
};

/** ISBN-10 o ISBN-13 escrito dentro de un título, sin guiones. */
export const isbnDe = (titulo) => {
    const compacto = String(titulo || '').replace(/[\s-]/g, '');
    const trece = compacto.match(/97[89]\d{10}/);
    if (trece) return trece[0];
    const diez = compacto.match(/(?<!\d)\d{9}[\dXx](?!\d)/);
    return diez ? diez[0].toUpperCase() : null;
};

/**
 * El título que se puede sacar del nombre del fichero sin preguntar a nadie.
 *
 * Devuelve `null` si no queda nada legible: un ISBN pelado no se convierte en
 * título, se busca.
 */
export const limpiarTitulo = (titulo) => {
    let texto = cleanTitle(titulo);
    RUIDO.lastIndex = 0;
    texto = texto.replace(RUIDO, ' ');
    if (!/\s/.test(texto) && texto.includes('-')) texto = texto.replace(/-/g, ' ');
    texto = texto.replace(/\s*-\s*$/, '').replace(/\s+/g, ' ').trim();

    if (!texto || /^[\d\s-]+[xX]?$/.test(texto)) return null;
    return texto.charAt(0).toLocaleUpperCase('es') + texto.slice(1);
};

/**
 * Parecido entre dos títulos, de 0 a 1.
 *
 * Se mide por palabras compartidas respecto al título más corto: «Dune» y
 * «Dune (Las crónicas de Dune, 1)» son el mismo libro aunque uno tenga cinco
 * palabras más, y una medida simétrica los daría por distintos.
 */
export const parecido = (a, b) => {
    const pa = new Set(palabras(a));
    const pb = new Set(palabras(b));
    if (!pa.size || !pb.size) return 0;
    let comunes = 0;
    for (const palabra of pa) if (pb.has(palabra)) comunes += 1;
    return comunes / Math.min(pa.size, pb.size);
};

/** Por debajo de esto un resultado de OpenLibrary no se acepta. */
export const PARECIDO_MINIMO = 0.75;

/**
 * El resultado de OpenLibrary que de verdad es este libro, o `null`.
 *
 * Con ISBN la búsqueda ya es exacta y vale el primero. Sin él, manda el título,
 * y si el libro tiene autor conocido tiene que coincidir: dos libros distintos
 * con el mismo título son corrientes —«Fundación»—, dos con mismo título y
 * mismo autor no.
 */
export const elegirCandidato = ({ buscado, autor, porIsbn = false }, resultados = []) => {
    const lista = (resultados || []).filter((r) => r?.title);
    if (!lista.length) return null;
    if (porIsbn) return lista[0];

    const autorConocido = !autorDesconocido(autor);
    let mejor = null;
    let mejorNota = 0;

    for (const resultado of lista) {
        const nota = parecido(buscado, resultado.title);
        if (nota < PARECIDO_MINIMO) continue;
        if (autorConocido && resultado.author && parecido(autor, resultado.author) < 0.5) continue;
        if (nota > mejorNota) {
            mejor = resultado;
            mejorNota = nota;
        }
    }
    return mejor;
};

const tienePortada = (libro) => Boolean(libro.coverBase64 || libro.customCover || libro.coverUrl);

/** Qué le pasa a cada libro, sin red. */
export const diagnosticar = (libros = []) => libros
    .filter((libro) => libro && !libro.loading)
    .map((libro) => ({
        id: libro.id,
        titulo: tituloSospechoso(libro.name),
        autor: autorDesconocido(libro.author),
        portada: !tienePortada(libro),
    }))
    .filter((d) => d.titulo || d.autor || d.portada);

/** Totales para la pantalla de entrada. */
export const resumirDiagnostico = (libros = []) => {
    const diagnostico = diagnosticar(libros);
    return {
        libros: diagnostico.length,
        titulos: diagnostico.filter((d) => d.titulo).length,
        autores: diagnostico.filter((d) => d.autor).length,
        portadas: diagnostico.filter((d) => d.portada).length,
        series: detectSeriesCandidates(libros).length,
    };
};

/**
 * Propuestas que no necesitan internet: títulos limpios y series.
 *
 * @returns {Array<{id: string, actual: Object, cambios: Object, motivos: string[]}>}
 */
export const propuestasLocales = (libros = []) => {
    const porId = new Map();
    const anotar = (libro, cambios, motivo) => {
        const previa = porId.get(libro.id) || { id: libro.id, actual: resumen(libro), cambios: {}, motivos: [] };
        Object.assign(previa.cambios, cambios);
        previa.motivos.push(motivo);
        porId.set(libro.id, previa);
    };

    for (const libro of libros) {
        if (!libro || libro.loading || !tituloSospechoso(libro.name)) continue;
        const limpio = limpiarTitulo(libro.name);
        if (limpio && limpio !== libro.name) {
            anotar(libro, { name: limpio, originalTitle: limpio }, 'título');
        }
    }

    for (const grupo of detectSeriesCandidates(libros)) {
        const nombre = nombreDeSerie(grupo.books[0]?.name) || grupo.suggestedName;
        for (const miembro of grupo.books) {
            const libro = libros.find((candidato) => candidato.id === miembro.id);
            if (!libro) continue;
            anotar(libro, { series: nombre, seriesIndex: miembro.detectedIndex }, 'serie');
        }
    }

    return [...porId.values()];
};

/**
 * El nombre de la serie a partir del título de uno de sus libros.
 *
 * `detectSeriesCandidates` del núcleo ya lo propone, pero su expresión para
 * quitar «n.º» no exige límite de palabra y se come la última letra de títulos
 * que acaban en «n»: «Mistborn 1» sale como serie «Mistbor». El núcleo es copia
 * del escritorio y no se toca aquí; el arreglo de verdad va allí.
 */
const nombreDeSerie = (titulo) => {
    const base = String(titulo || '')
        .replace(/[\s.,:_#-]*(\d{1,3}|[ivx]{1,4})\s*$/i, '')
        .replace(/[\s.,:_#-]+(vol\.?|volumen|libro|book|parte|part|tomo|n\.?º)$/i, '')
        .trim();
    return base.length >= 2 ? base : null;
};

const resumen = (libro) => ({
    name: libro.name,
    author: libro.author,
    cover: libro.customCover || libro.coverBase64 || libro.coverUrl || null,
    series: libro.series || '',
});

/**
 * Revisa la biblioteca contra OpenLibrary y devuelve las propuestas.
 *
 * Va libro a libro y con pausa entre peticiones: OpenLibrary es un servicio
 * gratuito y sin clave, y doscientas peticiones de golpe son la forma de que
 * empiece a rechazarlas.
 *
 * @param {Object} opciones
 * @param {Object[]} opciones.libros
 * @param {(consulta: {title?: string, author?: string, isbn?: string}) => Promise<{results: Object[], offline: boolean}>} opciones.buscar
 * @param {(hecho: number, total: number) => void} [opciones.alAvanzar]
 * @param {() => boolean} [opciones.cancelado]
 * @param {number} [opciones.pausa] Milisegundos entre peticiones.
 */
export const revisarEnLinea = async ({ libros = [], buscar, alAvanzar, cancelado, pausa = 350 }) => {
    const locales = new Map(propuestasLocales(libros).map((p) => [p.id, p]));
    const pendientes = diagnosticar(libros);
    const propuestas = [];
    let sinConexion = false;

    for (let i = 0; i < pendientes.length; i += 1) {
        if (cancelado?.()) break;
        const diagnostico = pendientes[i];
        const libro = libros.find((candidato) => candidato.id === diagnostico.id);
        const local = locales.get(libro.id);
        locales.delete(libro.id);

        const isbn = isbnDe(libro.name) || isbnDe(libro.originalTitle);
        const buscado = isbn ? null : (local?.cambios.name || limpiarTitulo(libro.name) || libro.name);

        let candidato = null;
        try {
            const respuesta = await buscar(isbn ? { isbn } : { title: buscado, author: libro.author });
            if (respuesta?.offline) { sinConexion = true; break; }
            candidato = elegirCandidato({ buscado, autor: libro.author, porIsbn: Boolean(isbn) }, respuesta?.results);
        } catch {
            candidato = null;
        }

        const propuesta = local || { id: libro.id, actual: resumen(libro), cambios: {}, motivos: [] };
        if (candidato) {
            if (diagnostico.titulo && candidato.title) {
                propuesta.cambios.name = candidato.title;
                propuesta.cambios.originalTitle = candidato.title;
                if (!propuesta.motivos.includes('título')) propuesta.motivos.push('título');
            }
            if (diagnostico.autor && candidato.author) {
                propuesta.cambios.author = candidato.author;
                propuesta.cambios.originalAuthor = candidato.author;
                propuesta.motivos.push('autor');
            }
            if (diagnostico.portada && candidato.coverUrl) {
                // La portada se descarga al aplicar, no ahora: si el usuario
                // desmarca el libro, no hay por qué haberla bajado.
                propuesta.portadaUrl = candidato.coverUrl;
                propuesta.motivos.push('portada');
            }
        }
        if (propuesta.motivos.length) propuestas.push(propuesta);

        alAvanzar?.(i + 1, pendientes.length);
        if (pausa && i < pendientes.length - 1) {
            await new Promise((listo) => { setTimeout(listo, pausa); });
        }
    }

    // Lo local que no estaba entre los pendientes (series, sobre todo) también va.
    return { propuestas: [...propuestas, ...locales.values()], sinConexion };
};

/**
 * Los campos que se escriben en el libro al aceptar una propuesta.
 *
 * El título y el autor se escriben a la vez en el visible y en el «original»:
 * si solo se cambiara uno, el modelo de datos lo leería como una edición manual
 * del usuario y una revisión posterior ya no lo tocaría.
 */
export const cambiosAplicables = (propuesta, portada = null) => {
    const cambios = { ...propuesta.cambios, metadataUpdatedAt: Date.now() };
    if (portada) cambios.customCover = portada;
    return cambios;
};
