import { parecido } from './ordenar.js';

/**
 * Traer subrayados, notas y progreso desde otro lector.
 *
 * ## Por qué
 *
 * Cambiar de lector es empezar de cero: años de subrayados se quedan en la app
 * vieja, y por eso casi nadie cambia. Esto baja ese coste a un fichero.
 *
 * ## Qué formatos
 *
 * Solo los que están documentados y no cambian sin avisar:
 *
 *  - **Kindle**: `My Clippings.txt`, el fichero que el Kindle guarda con todos
 *    los subrayados y notas (en la raíz del aparato, carpeta `documents`).
 *  - **KOReader**: `metadata.<formato>.lua`, uno por libro, en la carpeta
 *    `<libro>.sdr` junto al fichero. Trae subrayados, notas y el porcentaje
 *    leído.
 *
 * Las copias de Moon+ Reader y ReadEra son formatos cerrados que cambian entre
 * versiones; prometer que se leen sin poder probarlo con copias reales sería
 * engañar.
 *
 * Todo es puro: entra texto y sale una lista de libros con sus anotaciones.
 */

/** @typedef {{ texto: string, nota?: string, fecha?: string }} Subrayado */
/** @typedef {{ titulo: string, autor: string, subrayados: Subrayado[], progreso?: number|null }} LibroMigrado */

// ── Kindle ──────────────────────────────────────────────────────────────────

const SEPARADOR_KINDLE = /^={5,}\s*$/m;

/** «Título (Autor)», con paréntesis en el título si los hay. */
const tituloYAutor = (linea) => {
    const limpia = linea.replace(/^﻿/, '').trim();
    const m = limpia.match(/^(.*)\(([^()]*)\)\s*$/);
    if (!m) return { titulo: limpia, autor: '' };
    return { titulo: m[1].trim(), autor: m[2].trim() };
};

/** Qué es cada recorte, en inglés o en español. */
const tipoDe = (linea) => {
    const l = linea.toLowerCase();
    if (/highlight|subrayado|resaltado|destacado/.test(l)) return 'subrayado';
    if (/\bnote\b|\bnota\b/.test(l)) return 'nota';
    if (/bookmark|marcador/.test(l)) return 'marcador';
    return null;
};

/** La posición del recorte, para emparejar cada nota con su subrayado. */
const posicionDe = (linea) => {
    const m = linea.match(/(?:location|posición|pos\.)\s*(\d+)(?:-(\d+))?/i);
    return m ? { desde: Number(m[1]), hasta: Number(m[2] || m[1]) } : null;
};

/**
 * Lee `My Clippings.txt`.
 *
 * Las notas de Kindle van en un recorte aparte, justo detrás del subrayado al
 * que pertenecen y con la misma posición final: se juntan con él.
 *
 * @returns {LibroMigrado[]}
 */
export const leerClippingsKindle = (texto) => {
    const porLibro = new Map();

    for (const bloque of String(texto || '').split(SEPARADOR_KINDLE)) {
        const lineas = bloque.split(/\r?\n/).map((l) => l.trim());
        while (lineas.length && !lineas[0]) lineas.shift();
        if (lineas.length < 3) continue;

        const { titulo, autor } = tituloYAutor(lineas[0]);
        const cabecera = lineas[1];
        const tipo = tipoDe(cabecera);
        const contenido = lineas.slice(2).join(' ').replace(/\s+/g, ' ').trim();
        if (!titulo || !tipo || tipo === 'marcador' || !contenido) continue;

        const clave = `${titulo}|${autor}`;
        if (!porLibro.has(clave)) porLibro.set(clave, { titulo, autor, subrayados: [], progreso: null });
        const libro = porLibro.get(clave);
        const posicion = posicionDe(cabecera);
        const fecha = cabecera.split('|').pop()?.replace(/^.*?(added on|añadido el)\s*/i, '').trim() || '';

        if (tipo === 'nota') {
            const suyo = [...libro.subrayados].reverse()
                .find((s) => s.posicion && posicion && s.posicion.hasta === posicion.desde);
            if (suyo) suyo.nota = contenido;
            else libro.subrayados.push({ texto: '', nota: contenido, fecha, posicion });
            continue;
        }
        // El Kindle repite un recorte si se edita el subrayado: gana el último.
        const repetido = libro.subrayados.findIndex((s) => s.posicion && posicion && s.posicion.desde === posicion.desde);
        const nuevo = { texto: contenido, fecha, posicion };
        if (repetido >= 0) libro.subrayados[repetido] = { ...libro.subrayados[repetido], ...nuevo };
        else libro.subrayados.push(nuevo);
    }

    return [...porLibro.values()].map((libro) => ({
        ...libro,
        subrayados: libro.subrayados.map(({ posicion, ...resto }) => resto),
    }));
};

// ── KOReader ────────────────────────────────────────────────────────────────

/**
 * Un intérprete mínimo de tablas Lua: lo justo para los ficheros de metadatos
 * de KOReader, que son `return { ... }` con cadenas, números, booleanos y
 * tablas anidadas. Nada se ejecuta: se lee.
 */
export const leerTablaLua = (fuente) => {
    const texto = String(fuente || '');
    let i = texto.indexOf('return');
    i = i >= 0 ? i + 6 : 0;

    const espacios = () => {
        for (;;) {
            while (i < texto.length && /\s/.test(texto[i])) i += 1;
            if (texto.startsWith('--', i)) {
                const fin = texto.indexOf('\n', i);
                i = fin < 0 ? texto.length : fin + 1;
                continue;
            }
            return;
        }
    };

    const cadena = () => {
        const comilla = texto[i];
        i += 1;
        let salida = '';
        while (i < texto.length && texto[i] !== comilla) {
            if (texto[i] === '\\') {
                const siguiente = texto[i + 1];
                const escapes = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'" };
                if (siguiente in escapes) { salida += escapes[siguiente]; i += 2; continue; }
                if (/\d/.test(siguiente)) {
                    const m = texto.slice(i + 1).match(/^\d{1,3}/)[0];
                    salida += String.fromCharCode(Number(m));
                    i += 1 + m.length;
                    continue;
                }
                if (siguiente === '\n') { salida += '\n'; i += 2; continue; }
            }
            salida += texto[i];
            i += 1;
        }
        i += 1;
        return salida;
    };

    const valor = () => {
        espacios();
        const c = texto[i];
        if (c === '{') return tabla();
        if (c === '"' || c === "'") return cadena();
        if (texto.startsWith('[[', i)) {
            const fin = texto.indexOf(']]', i + 2);
            const salida = texto.slice(i + 2, fin);
            i = fin + 2;
            return salida;
        }
        const m = texto.slice(i).match(/^(true|false|nil|-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/);
        if (!m) throw new Error(`Lua: valor no esperado en ${i}`);
        i += m[0].length;
        if (m[0] === 'true') return true;
        if (m[0] === 'false') return false;
        if (m[0] === 'nil') return null;
        return Number(m[0]);
    };

    const tabla = () => {
        i += 1; // {
        const objeto = {};
        let siguienteIndice = 1;
        for (;;) {
            espacios();
            if (texto[i] === '}') { i += 1; break; }
            let clave;
            if (texto[i] === '[') {
                i += 1;
                clave = valor();
                espacios();
                i += 1; // ]
                espacios();
                i += 1; // =
            } else {
                const m = texto.slice(i).match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/);
                if (m) {
                    clave = m[1];
                    i += m[0].length;
                } else {
                    clave = siguienteIndice;
                    siguienteIndice += 1;
                }
            }
            objeto[clave] = valor();
            espacios();
            if (texto[i] === ',' || texto[i] === ';') i += 1;
        }
        return objeto;
    };

    espacios();
    return valor();
};

const lista = (tabla) => (tabla && typeof tabla === 'object'
    ? Object.keys(tabla).filter((k) => /^\d+$/.test(k)).sort((a, b) => a - b).map((k) => tabla[k])
    : []);

/**
 * Lee un `metadata.*.lua` de KOReader.
 *
 * Hay dos formatos: el actual (`annotations`, una lista) y el de antes de 2024
 * (`highlight`, por página, con las notas en `bookmarks`). Se aceptan los dos.
 *
 * @returns {LibroMigrado|null}
 */
export const leerMetadatosKoreader = (fuente) => {
    let datos;
    try {
        datos = leerTablaLua(fuente);
    } catch {
        return null;
    }
    if (!datos || typeof datos !== 'object') return null;

    const props = datos.doc_props || {};
    const titulo = String(props.title || datos.stats?.title || '').trim();
    const autor = String(props.authors || datos.stats?.authors || '').replace(/\n/g, ', ').trim();

    let subrayados = [];
    if (datos.annotations) {
        subrayados = lista(datos.annotations)
            .filter((a) => a && (a.text || a.note) && (a.pos0 || a.text))
            .map((a) => ({ texto: String(a.text || '').trim(), nota: String(a.note || '').trim(), fecha: a.datetime || '' }));
    } else if (datos.highlight) {
        const notas = new Map(lista(datos.bookmarks).filter((b) => b?.notes && b?.text).map((b) => [String(b.notes).trim(), String(b.text).trim()]));
        for (const pagina of Object.values(datos.highlight)) {
            for (const h of lista(pagina)) {
                if (!h?.text) continue;
                const texto = String(h.text).trim();
                subrayados.push({ texto, nota: notas.get(texto) || '', fecha: h.datetime || '' });
            }
        }
    }

    const progreso = Number.isFinite(Number(datos.percent_finished)) ? Number(datos.percent_finished) : null;
    if (!titulo && !subrayados.length) return null;
    return { titulo, autor, subrayados, progreso };
};

/** ¿Qué formato es este fichero? */
export const formatoDe = (nombre = '', texto = '') => {
    if (/\.lua$/i.test(nombre) || /^\s*(--.*\n\s*)*return\s*\{/.test(texto)) return 'koreader';
    if (SEPARADOR_KINDLE.test(texto)) return 'kindle';
    return null;
};

// ── Emparejar con la biblioteca ─────────────────────────────────────────────

/**
 * El libro de la biblioteca que corresponde a uno de otra app, o null.
 *
 * Los títulos de un Kindle traen añadidos («Dune (Spanish Edition)»), así que se
 * compara por parecido y no por igualdad; con autor, tiene que coincidir.
 */
export const emparejar = (migrado, libros = []) => {
    let mejor = null;
    let nota = 0;
    const titulo = migrado.titulo.replace(/\((?:spanish|english)? ?edition\)|\[[^\]]*\]/gi, '').trim();
    for (const libro of libros) {
        const p = parecido(titulo, libro.name || libro.originalTitle || '');
        if (p < 0.75) continue;
        if (migrado.autor && libro.author && !/desconocido/i.test(libro.author)) {
            if (parecido(migrado.autor.replace(/,/g, ' '), libro.author) < 0.5) continue;
        }
        if (p > nota) { mejor = libro; nota = p; }
    }
    return mejor;
};
