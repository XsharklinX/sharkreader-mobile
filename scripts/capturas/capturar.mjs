/**
 * Capturas de Google Play, de la app real.
 *
 *   1. `pnpm vite --port 5191 --host 127.0.0.1` en otra terminal.
 *   2. `PLAYWRIGHT=<ruta a playwright/index.mjs> node scripts/capturas/capturar.mjs`
 *
 * Hace las fotos de cada pantalla con la biblioteca de muestra (`main.jsx`) y
 * después compone cada imagen de la ficha —título arriba, la pantalla en un
 * marco de teléfono— en español e inglés, a 1080×1920. Salen en
 * `playstore/capturas/{es,en}/`.
 *
 * Los libros de muestra no se versionan (`libros/`): son clásicos de dominio
 * público de Standard Ebooks y Project Gutenberg. Ver `libros/LEEME.md`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..');
const CRUDAS = resolve(AQUI, 'salida', 'crudas');
const FICHA = resolve(RAIZ, 'playstore', 'capturas');
const URL_BASE = process.env.URL_CAPTURAS || 'http://127.0.0.1:5191';

const modulo = process.env.PLAYWRIGHT ? pathToFileURL(process.env.PLAYWRIGHT).href : 'playwright';
const { chromium } = await import(modulo);

/** Teléfono de 400×711 a 2,7: la foto sale a 1080×1920, 9:16 exacto. */
const PANTALLA = { width: 400, height: 711 };
const ESCALA = 2.7;

/** Posición de la página que se enseña de cada libro: un capítulo con texto, no la portada. */
const QUIJOTE = 'epubcfi(/6/10!/4/2[pgepubid00002]/176/1:0)';
const ORGULLO = 'epubcfi(/6/6!/4/2[chapter-1]/2/1:0)';
const LETRA = { fontSize: 17, margin: 22, lineHeight: 1.5, fontFamily: 'literata' };

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Carga una plantilla y la monta, con un reintento: si Vite acaba de ver un
 * fichero cambiado, recarga la página una vez justo después de abrirla.
 */
const montarPlantilla = async (page, ruta, ...datos) => {
    for (let intento = 0; ; intento += 1) {
        try {
            await page.goto(`${URL_BASE}/scripts/capturas/${ruta}`, { waitUntil: 'load' });
            await page.waitForFunction(() => typeof window.montar === 'function');
            await page.evaluate((d) => window.montar(...d), datos);
            await page.waitForFunction(() => window.__montada);
            return;
        } catch (fallo) {
            if (intento >= 2) throw fallo;
            await esperar(1500);
        }
    }
};

const abrir = async (browser, { preferencias, libros } = {}) => {
    const ctx = await browser.newContext({ viewport: PANTALLA, deviceScaleFactor: ESCALA, locale: 'es-ES' });
    const page = await ctx.newPage();
    // La foto de la página para el pliegue: en el móvil la saca Android.
    await page.exposeFunction('__foto', async () => {
        const png = await page.screenshot({ type: 'png' });
        return { image: `data:image/png;base64,${png.toString('base64')}`, width: PANTALLA.width * ESCALA, height: PANTALLA.height * ESCALA };
    });
    await page.addInitScript((datos) => {
        window.__preferencias = datos.preferencias;
        window.__libros = datos.libros;
    }, { preferencias, libros });
    await page.goto(`${URL_BASE}/scripts/capturas/index.html`);
    await page.waitForFunction(() => window.__listo, null, { timeout: 90000 });
    await esperar(1500);
    return { ctx, page };
};

const foto = (page, nombre) => page.screenshot({ path: resolve(CRUDAS, `${nombre}.png`) });
const toque = (page, x, y) => page.mouse.click(x, y);
const pulsar = (page, etiqueta) => page.getByLabel(etiqueta, { exact: true }).first().click({ timeout: 15000 });

/** Cada escena deja una o más fotos en `salida/crudas`. */
const ESCENAS = {
    async biblioteca(browser) {
        const { ctx, page } = await abrir(browser);
        await esperar(1500);
        await foto(page, 'biblioteca');
        await ctx.close();
    },

    async lectura(browser) {
        const { ctx, page } = await abrir(browser, {
            libros: { 'demo-0': { lastLocation: QUIJOTE, readerPreferences: { theme: 'cream', typography: LETRA } } },
        });
        await page.getByText('SEGUIR LEYENDO').click();
        await esperar(6000);
        await foto(page, 'lectura');
        // La siguiente, para lo que queda debajo del pliegue.
        await toque(page, 370, 380);
        await esperar(2500);
        await foto(page, 'lectura-siguiente');

        // Hasta aquí: la ficha del libro y su resumen.
        await toque(page, 200, 380);
        await esperar(700);
        await pulsar(page, 'Ficha de Don Quijote');
        await esperar(1200);
        await page.getByText('Lo que ha pasado hasta aquí').click();
        await esperar(14000);
        await foto(page, 'resumen');
        await ctx.close();
    },

    async personajes(browser) {
        const { ctx, page } = await abrir(browser, {
            libros: { 'demo-0': { lastLocation: QUIJOTE, readerPreferences: { theme: 'cream', typography: LETRA } } },
        });
        await page.getByText('SEGUIR LEYENDO').click();
        await esperar(6000);
        await toque(page, 200, 380);
        await esperar(700);
        await pulsar(page, 'Personajes y lugares');
        await esperar(10000);
        await foto(page, 'personajes');
        await ctx.close();
    },

    async traduccion(browser) {
        const { ctx, page } = await abrir(browser, {
            preferencias: { traduccion: { activo: true, a: 'es', soloWifi: true } },
            libros: { 'demo-1': { lastLocation: ORGULLO, readerPreferences: { theme: 'paper', typography: LETRA } } },
        });
        await page.getByText('Pride and Prejudice').first().click();
        await esperar(7000);
        // Con la traducción encendida, tocar un párrafo lo traduce debajo.
        await toque(page, 200, 130);
        await esperar(2000);
        await toque(page, 200, 330);
        await esperar(2000);
        await foto(page, 'traduccion');
        await ctx.close();
    },

    async pdf(browser) {
        const { ctx, page } = await abrir(browser, {
            libros: { 'demo-9': { lastLocation: '1', pdfScale: 1, readerPreferences: { theme: 'paper' } } },
        });
        await page.getByText('La imprenta y la lectura').first().click();
        await esperar(7000);
        await pulsar(page, 'Escribir en la página');
        await esperar(1500);
        await foto(page, 'pdf');
        await ctx.close();
    },

    async progreso(browser) {
        const { ctx, page } = await abrir(browser);
        await page.locator('.icon-btn').first().click();
        await esperar(900);
        await page.getByText('Progreso').first().click();
        await esperar(2500);
        await foto(page, 'progreso');
        await ctx.close();
    },

    /**
     * El pliegue, con el mismo sombreador que la app (`pliegueGL.js`): la
     * página actual como textura, doblada, y la siguiente debajo.
     */
    async pliegue(browser) {
        const ctx = await browser.newContext({ viewport: PANTALLA, deviceScaleFactor: ESCALA });
        const page = await ctx.newPage();
        const datos = (n) => `data:image/png;base64,${readFileSync(resolve(CRUDAS, `${n}.png`)).toString('base64')}`;
        await page.goto(`${URL_BASE}/scripts/capturas/pliegue.html?f=[70,560]`);
        await page.waitForFunction(() => window.__pliegue?.listoParaFotos, null, { timeout: 30000 });
        await page.evaluate(([arriba, abajo]) => window.__pliegue.pintar(arriba, abajo), [datos('lectura'), datos('lectura-siguiente')]);
        await esperar(800);
        await foto(page, 'pliegue');
        await ctx.close();
    },
};

/** Lo que dice cada imagen de la ficha, en el orden en que salen. */
const DIAPOSITIVAS = [
    {
        cruda: 'lectura', nombre: '01-lectura',
        es: ['Lee como en papel', 'Letra cuidada, temas cálidos y nada que te distraiga.'],
        en: ['Reading that feels like paper', 'Careful typography, warm themes and nothing in the way.'],
    },
    {
        cruda: 'pliegue', nombre: '02-pasar-pagina',
        es: ['La hoja se dobla bajo tu dedo', 'Con la página siguiente de verdad debajo.'],
        en: ['Pages that curl under your finger', 'With the real next page waiting underneath.'],
    },
    {
        cruda: 'biblioteca', nombre: '03-biblioteca',
        es: ['Tu biblioteca, a la vista', 'EPUB, PDF, cómics y más. Sin cuenta, sin nube, sin anuncios.'],
        en: ['Your library, beautifully kept', 'EPUB, PDF, comics and more. No account, no cloud, no ads.'],
    },
    {
        cruda: 'resumen', nombre: '04-hasta-aqui',
        es: ['¿Lo dejaste semanas? Ponte al día', 'Lo que ha pasado hasta tu página. Ni una línea más allá.'],
        en: ['Back after weeks? Catch up', 'What happened up to your page. Not a line further.'],
    },
    {
        cruda: 'traduccion', nombre: '05-traducir',
        es: ['Lee en otro idioma', 'Toca un párrafo y míralo traducido, sin conexión.'],
        en: ['Read in another language', 'Tap a paragraph to see it translated, offline.'],
    },
    {
        cruda: 'pdf', nombre: '06-pdf',
        es: ['Escribe sobre tus PDF', 'Lápiz con presión, marcador y goma. Compártelo con tus notas.'],
        en: ['Write on your PDFs', 'Pressure-sensitive pen, highlighter and eraser. Share it with your notes.'],
    },
    {
        cruda: 'personajes', nombre: '07-personajes',
        es: ['Quién es quién, sin destripes', 'Personajes y lugares de lo que llevas leído.'],
        en: ["Who's who, spoiler-free", "Characters and places from what you've read so far."],
    },
    {
        cruda: 'progreso', nombre: '08-progreso',
        es: ['Lee un poco cada día', 'Rachas, metas y cuándo lees mejor.'],
        en: ['Read a little every day', 'Streaks, goals and when you read best.'],
    },
];

const componer = async (browser) => {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    for (const idioma of ['es', 'en']) {
        mkdirSync(resolve(FICHA, idioma), { recursive: true });
        for (const d of DIAPOSITIVAS) {
            const [titulo, linea] = d[idioma];
            const imagen = `data:image/png;base64,${readFileSync(resolve(CRUDAS, `${d.cruda}.png`)).toString('base64')}`;
            await montarPlantilla(page, 'diapositiva.html', titulo, linea, imagen);
            await page.screenshot({ path: resolve(FICHA, idioma, `${d.nombre}.png`) });
        }
    }
    await page.close();
};

/** El gráfico destacado, 1024×500, con el icono y dos pantallas reales. */
const DESTACADA = {
    es: { titulo: 'Lee como en papel', linea: 'EPUB, PDF y cómics. Sin cuenta, sin nube, sin anuncios.' },
    en: { titulo: 'Reading that feels like paper', linea: 'EPUB, PDF and comics. No account, no cloud, no ads.' },
};

const destacada = async (browser) => {
    const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
    const datos = (ruta) => `data:image/png;base64,${readFileSync(ruta).toString('base64')}`;
    for (const [idioma, textos] of Object.entries(DESTACADA)) {
        await montarPlantilla(page, 'destacada.html', {
            ...textos,
            icono: datos(resolve(RAIZ, 'playstore', 'icono-512.png')),
            delante: datos(resolve(CRUDAS, 'lectura.png')),
            atras: datos(resolve(CRUDAS, 'biblioteca.png')),
        });
        await page.screenshot({ path: resolve(RAIZ, 'playstore', `destacada-${idioma}.png`) });
    }
    await page.close();
};

const pedidas = process.argv.slice(2);
mkdirSync(CRUDAS, { recursive: true });
const browser = await chromium.launch();
try {
    const nombres = pedidas.length ? pedidas.filter((n) => ESCENAS[n]) : Object.keys(ESCENAS);
    for (const nombre of nombres) {
        if (!ESCENAS[nombre]) continue;
        const inicio = Date.now();
        try {
            await ESCENAS[nombre](browser);
            console.log(`✓ ${nombre} (${Math.round((Date.now() - inicio) / 1000)} s)`);
        } catch (fallo) {
            console.log(`✗ ${nombre}: ${String(fallo).split('\n')[0]}`);
        }
    }
    if (!pedidas.length || pedidas.includes('componer')) {
        await componer(browser);
        console.log(`✓ ficha en ${FICHA}`);
    }
    if (!pedidas.length || pedidas.includes('destacada')) {
        await destacada(browser);
        console.log('✓ gráfico destacado');
    }
} finally {
    await browser.close();
}
writeFileSync(resolve(CRUDAS, '.ultima'), new Date().toISOString());
