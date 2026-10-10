/**
 * Arranque para sacar las capturas de Google Play.
 *
 * La app real, entera, pero con puertos en memoria en vez de los nativos: en
 * un navegador no hay SQLite ni selector de Android, y sin esto la biblioteca
 * sale vacía. Se siembra una biblioteca de clásicos de dominio público con
 * progreso, subrayados y meses de lectura, para que cada pantalla se vea como
 * la de alguien que la usa de verdad.
 *
 * No entra en la app publicada: Vite solo empaqueta `index.html`.
 * Lo usa `scripts/capturas/capturar.mjs`.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../../src/App.jsx';
import { installPorts } from '../../src/ports/index.js';
import { importPickedBooks } from '../../src/library/importBooks.js';
import { hydrateStoredBook } from '../../src/core/bookModel.js';
import { buildAchievementContext } from '../../src/stats/achievementContext.js';
import { checkNewAchievements } from '../../src/core/achievements.js';
import '../../src/styles/app.css';
import '../../src/styles/reader-chrome.css';
import '../../src/styles/sheets.css';
import '../../src/styles/novedades.css';

const LIBROS = [
    ['gutenberg-2000.epub', 0.37, 0],
    ['jane-austen_pride-and-prejudice.epub', 0.82, 1],
    ['herman-melville_moby-dick.epub', 0.12, 3],
    ['gutenberg-17340.epub', 1, 9],
    ['arthur-conan-doyle_the-adventures-of-sherlock-holmes.epub', 0.55, 2],
    ['mary-shelley_frankenstein.epub', 1, 20],
    ['bram-stoker_dracula.epub', 0.24, 6],
    ['gutenberg-49836.epub', 0.63, 4],
    ['alice.epub', 0, 30],
    ['apuntes-imprenta.pdf', 0.5, 0],
];

// ── Lo escrito a mano en el PDF de apuntes ───────────────────────────────────
// Trazos sobre palabras reales de la página 1 (posiciones sacadas con pdf.js),
// con el temblor y la presión de una mano, no líneas de regla.
let semillaTinta = 11;
const temblor = (n) => { semillaTinta = (semillaTinta * 9301 + 49297) % 233280; return ((semillaTinta / 233280) - 0.5) * n; };
const trazo = (herramienta, color, ancho, puntos) => ({ herramienta, color, ancho, puntos });
const linea = (x1, y1, x2, y2, pasos = 18, t = 0.0012) => Array.from({ length: pasos + 1 }, (_, i) => {
    const k = i / pasos;
    return [x1 + (x2 - x1) * k + temblor(t), y1 + (y2 - y1) * k + temblor(t), 0.45 + Math.sin(k * Math.PI) * 0.4];
});
const elipse = (cx, cy, rx, ry, pasos = 40) => Array.from({ length: pasos + 3 }, (_, i) => {
    const a = -0.4 + (i / pasos) * Math.PI * 2.08;
    return [cx + Math.cos(a) * rx + temblor(0.003), cy + Math.sin(a) * ry + temblor(0.002), 0.5 + 0.3 * Math.sin(a * 1.5)];
});
const TINTA_DEMO = {
    1: [
        trazo('marcador', '#ffd400', 0.024, linea(0.146, 0.660, 0.877, 0.660, 14, 0.0006)),
        trazo('marcador', '#ffd400', 0.024, linea(0.146, 0.686, 0.877, 0.686, 14, 0.0006)),
        trazo('marcador', '#ffd400', 0.024, linea(0.146, 0.713, 0.318, 0.713, 6, 0.0006)),
        trazo('boligrafo', '#c62828', 0.0034, elipse(0.232, 0.449, 0.135, 0.026)),
        trazo('boligrafo', '#1f4fd1', 0.0032, linea(0.121, 0.494, 0.236, 0.495, 14)),
        trazo('boligrafo', '#1f4fd1', 0.0032, [[0.392, 0.258, 0.4], [0.402, 0.268, 0.6], [0.43, 0.236, 0.8], [0.436, 0.229, 0.5]]),
    ],
};

const DIA = 86400000;

// ── Traducción de muestra ────────────────────────────────────────────────────
// En el móvil traduce ML Kit sin conexión; aquí, para la captura, el primer
// capítulo de Orgullo y prejuicio ya traducido.
const TRADUCCIONES = [
    ['it is a truth universally', 'Es una verdad universalmente reconocida que un hombre soltero, poseedor de una gran fortuna, necesita una esposa.'],
    ['however little known the', 'Por poco que se conozcan los sentimientos u opiniones de un hombre así cuando llega por primera vez a un vecindario, esta verdad está tan arraigada en la mente de las familias del lugar que lo consideran propiedad legítima de alguna de sus hijas.'],
    ['my dear mr bennet said his', '—Mi querido señor Bennet —le dijo un día su esposa—, ¿te has enterado de que por fin se ha alquilado Netherfield Park?'],
    ['mr bennet replied that he', 'El señor Bennet respondió que no.'],
    ['but it is returned she', '—Pues así es —insistió ella—; la señora Long acaba de estar aquí y me lo ha contado todo.'],
    ['mr bennet made no answer', 'El señor Bennet no contestó.'],
    ['do not you want to know who', '—¿No quieres saber quién lo ha alquilado? —exclamó su mujer con impaciencia.'],
    ['you want to tell me and i', '—Eres tú quien quiere contármelo, y no tengo inconveniente en escucharlo.'],
    ['this was invitation enough', 'Aquella fue invitación suficiente.'],
];
const clave = (texto) => String(texto).toLowerCase().replace(/[^a-z ]+/g, '').replace(/\s+/g, ' ').trim();
const traducirDemo = (texto) => TRADUCCIONES.find(([inicio]) => clave(texto).startsWith(inicio))?.[1] || texto;

// ── Almacenamiento en memoria ────────────────────────────────────────────────
const libros = new Map();
const ajustes = new Map();
const copia = (valor) => (valor === undefined ? undefined : structuredClone(valor));

const storage = {
    init: async () => {},
    listBooks: async () => [...libros.values()].map(copia),
    getBook: async (id) => copia(libros.get(id)) || null,
    putBook: async (registro) => { libros.set(registro.id, copia(registro)); },
    putBooks: async (lista) => { lista.forEach((r) => libros.set(r.id, copia(r))); },
    deleteBook: async (id) => { libros.delete(id); },
    getSetting: async (clave) => copia(ajustes.get(clave)) ?? null,
    setSetting: async (clave, valor) => { ajustes.set(clave, copia(valor)); },
    indexBookContent: async () => {},
    indexedBooks: async () => [],
    searchContent: async () => [],
};

const nada = async () => {};
const ports = {
    storage,
    filePicker: {
        pickBooks: async () => ({ books: [], cancelled: true }),
        pickFolder: async () => ({ books: [], cancelled: true }),
        pickImage: async () => null,
        pickBackup: async () => null,
        consumePendingOpen: async () => ({ book: null }),
        deleteBookFile: nada,
    },
    tts: {
        isSupported: async () => true,
        listVoices: async () => [
            { id: 'es-ES-1', name: 'Español (España)', lang: 'es-ES' },
            { id: 'en-GB-1', name: 'English (UK)', lang: 'en-GB' },
        ],
        speak: nada, pause: nada, resume: nada, stop: nada, prepare: nada,
        startService: nada, stopService: nada, onCommand: async () => () => {},
    },
    notifier: {
        requestPermission: async () => true, schedule: nada, cancel: nada,
        scheduleDailyReminder: nada, scheduleWeeklySummary: nada, cancelAll: nada,
    },
    sync: { read: async () => null, write: nada, test: async () => false },
    screen: { lock: nada, unlock: nada, current: async () => 'portrait', onChange: async () => () => {} },
    awake: { set: nada },
    // La foto de la página para el pliegue: en el móvil la saca Android; aquí
    // la saca Playwright (`window.__foto`), si la ha ofrecido.
    capture: (() => {
        let ultima = null;
        return {
            take: async () => { ultima = window.__foto ? await window.__foto() : null; return ultima; },
            last: () => ultima,
        };
    })(),
    luz: { disponible: async () => false, escuchar: async () => () => {} },
    servidor: { iniciar: async () => null, parar: nada, alRecibir: async () => () => {} },
    escritorio: { hola: async () => ({}), leer: async () => null, escribir: nada },
    traduccion: {
        descargados: async () => ['es', 'en'],
        preparar: nada,
        traducir: async (de, a, textos) => textos.map(traducirDemo),
    },
    resumen: { estado: async () => 'no', descargar: nada, resumir: async () => '' },
    noMolestar: { estado: async () => ({ permitido: true, activo: false }), pedirPermiso: nada, activar: async () => true, desactivar: nada },
};

// ── Siembra ──────────────────────────────────────────────────────────────────
const sembrar = async () => {
    const ahora = Date.now();
    const elegidos = LIBROS.map(([fichero], i) => ({
        id: `demo-${i}`,
        name: fichero,
        type: fichero.endsWith('.pdf') ? 'pdf' : 'epub',
        size: 1000 + i,
        path: `/scripts/capturas/libros/${fichero}`,
    }));
    const { imported } = await importPickedBooks(elegidos, []);
    imported.forEach((registro) => {
        const [, progreso, haceDias] = LIBROS[Number(registro.id.split('-')[1])];
        const leido = ahora - haceDias * DIA - 3600000;
        libros.set(registro.id, {
            ...registro,
            progress: progreso,
            isFinished: progreso >= 1,
            lastReadDate: progreso > 0 ? leido : 0,
            dateAdded: ahora - (40 + haceDias) * DIA,
            updatedAt: leido,
            ...(registro.type === 'pdf' ? {
                originalAuthor: 'Historia del Libro · Tema 3',
                bookmarks: [
                    { cfi: '1', kind: 'bookmark', date: '7/10/2026', note: JSON.stringify({ text: 'Página 1', comment: '' }) },
                    ...['La novedad no fue imprimir, sino hacerlo de forma repetible', 'Hacia 1450, Johannes Gutenberg', 'En cincuenta años se imprimieron más libros que en los mil anteriores']
                        .map((texto, i) => ({ cfi: '1', kind: 'highlight', color: 'yellow', date: '7/10/2026', note: JSON.stringify({ text: texto, comment: i === 0 ? 'Idea central del tema' : '' }) })),
                ],
            } : {}),
            ...((window.__libros || {})[registro.id] || {}),
        });
    });

    // Cuatro meses de lectura: más los fines de semana, casi todos los días.
    const minutesByDay = {};
    const history = {};
    const hourlyLog = {};
    let semilla = 7;
    const azar = () => { semilla = (semilla * 9301 + 49297) % 233280; return semilla / 233280; };
    let total = 0;
    for (let d = 182; d >= 0; d -= 1) {
        const dia = new Date(ahora - d * DIA);
        if (d > 22 && azar() < 0.22) continue;
        const finde = [0, 6].includes(dia.getDay());
        const minutos = Math.round((finde ? 45 : 22) + azar() * (finde ? 50 : 30));
        minutesByDay[dia.toDateString()] = minutos;
        history[dia.toDateString()] = 'read';
        total += minutos;
        const hora = azar() < 0.65 ? 22 + Math.floor(azar() * 2) : 8 + Math.floor(azar() * 10);
        hourlyLog[hora] = (hourlyLog[hora] || 0) + minutos;
    }
    const hoy = new Date(ahora).toDateString();
    ajustes.set('stats', {
        timeRead: total, streak: 23, maxStreak: 41, minutesByDay, history, hourlyLog,
        lastActiveDate: hoy, currentDailyMins: minutesByDay[hoy] || 20, streakSavers: 1,
    });
    // Los logros que ya tocan, ganados de antes: si no, salen todos a la vez
    // como avisos encima de la biblioteca.
    const contexto = buildAchievementContext([...libros.values()].map(hydrateStoredBook), ajustes.get('stats'));
    ajustes.set('achievements', Object.fromEntries(checkNewAchievements(contexto, {})
        .map((logro) => [logro.id, { unlockedAt: ahora - 5 * DIA }])));
    ajustes.set(`tinta:demo-${LIBROS.findIndex(([f]) => f.endsWith('.pdf'))}`, TINTA_DEMO);
    ajustes.set('goals', { daily: 30, weekly: 210, monthly: 900 });
    ajustes.set('preferences', {
        onboarded: true,
        welcomeSeen: true,
        sharky: false,
        ...(window.__preferencias || {}),
    });
    Object.entries(window.__ajustes || {}).forEach(([clave, valor]) => ajustes.set(clave, valor));
};

installPorts(ports);
document.documentElement.classList.add('theme-dark');

sembrar().then(() => {
    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
    window.__listo = true;
}).catch((fallo) => {
    document.body.textContent = `Siembra fallida: ${fallo?.stack || fallo}`;
});

window.__capturas = { libros, ajustes };
