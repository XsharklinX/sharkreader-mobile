import React, { useEffect, useRef, useState } from 'react';
import { usePorts } from '../ports/index.js';
import { readBookBlob } from '../adapters/SafPicker.js';
import { readEpubChapters } from '../library/useContentIndex.js';
import { textoConParrafos } from './personajes.js';
import { frasesClave, frasesDe, recortarParaResumen, vinetasDe } from './resumen.js';
import { idiomaDe, DESTINO_POR_DEFECTO, mensajeDeError } from './traducir.js';
import { useBackHandler } from '../ui/useBackHandler.js';
import { IconClose } from '../ui/icons.jsx';

const nombreDe = (href = '') => decodeURIComponent(String(href).split('#')[0]).split('/').pop();

/** Cuántos capítulos hacia atrás se resumen de entrada: los que dan contexto. */
const CAPITULOS = 4;

/**
 * Lo que ha pasado hasta aquí. Ver `resumen.js`.
 *
 * Del capítulo actual hacia atrás, uno a uno: el primero que sale es el que
 * más se necesita. Los capítulos terminados se guardan; el actual no, porque
 * cambia según avanzas.
 */
export default function ResumenSheet({ book, engine, location, toc = [], preferencias = {}, onClose }) {
    const ports = usePorts();
    const [ia, setIa] = useState(null);
    const [capitulos, setCapitulos] = useState([]);
    const [preparandoIa, setPreparandoIa] = useState(false);
    const [error, setError] = useState(null);
    const vivo = useRef(true);

    useBackHandler(() => { onClose(); return true; });
    useEffect(() => () => { vivo.current = false; }, []);

    useEffect(() => {
        ports.resumen?.estado().then(setIa).catch(() => setIa('no'));
        if (!ports.resumen) setIa('no');
    }, [ports]);

    const destino = preferencias.traduccion?.a || DESTINO_POR_DEFECTO();

    useEffect(() => {
        if (ia === null || ia === 'descargando') return;
        let cancelado = false;

        (async () => {
            try {
                const leidos = await readEpubChapters(await readBookBlob(book.sourcePath));
                const textos = leidos.map((c) => textoConParrafos(c.html));
                const actual = engine?.capituloDe(location?.cfi);
                let indice = leidos.findIndex((c) => nombreDe(c.href) === nombreDe(actual?.href));
                if (indice < 0) indice = 0;
                // El actual, solo hasta donde vas.
                textos[indice] = engine?.textoHastaAqui?.() || '';

                const guardados = await ports.storage.getSetting(`personajes:${book.id}`).catch(() => null);
                const nombres = (guardados?.analisis || []).slice(0, 20).map((d) => d.nombre);
                const usarIa = ia === 'disponible';

                const lista = [];
                for (let i = indice; i >= 0 && lista.length < CAPITULOS; i -= 1) {
                    if (frasesDe(textos[i]).length < 3) continue;
                    const etiqueta = toc.find((t) => nombreDe(t.href) === nombreDe(leidos[i].href))?.label || `Capítulo ${i + 1}`;
                    lista.push({ i, etiqueta, actual: i === indice, vinetas: null, modo: usarIa ? 'ia' : 'frases' });
                }
                if (cancelado) return;
                setCapitulos(lista);

                for (const capitulo of lista) {
                    if (cancelado || !vivo.current) return;
                    const clave = `resumen:${book.id}:${capitulo.i}:${capitulo.modo}:${destino}`;
                    let vinetas = capitulo.actual ? null : await ports.storage.getSetting(clave).catch(() => null);
                    if (!Array.isArray(vinetas)) {
                        vinetas = await resumirCapitulo(textos[capitulo.i], { usarIa, nombres });
                        if (!capitulo.actual && vinetas.length) ports.storage.setSetting(clave, vinetas).catch(() => {});
                    }
                    if (cancelado) return;
                    setCapitulos((antes) => antes.map((c) => (c.i === capitulo.i ? { ...c, vinetas } : c)));
                }
            } catch {
                if (!cancelado) setError('No se ha podido leer el libro para resumirlo.');
            }
        })();
        return () => { cancelado = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ia]);

    /** Un capítulo, con la IA (pasando por el inglés) o con frases clave. */
    const resumirCapitulo = async (texto, { usarIa, nombres }) => {
        if (!usarIa) return frasesClave(texto, { maximo: 3, nombres });
        const de = idiomaDe(texto, engine?.bookLanguage?.());
        try {
            const recortado = recortarParaResumen(texto);
            const enIngles = de === 'en'
                ? recortado
                : (await ports.traduccion.traducir(de, 'en', frasesDe(recortado))).join(' ');
            const vinetas = vinetasDe(await ports.resumen.resumir(enIngles));
            if (!vinetas.length) return frasesClave(texto, { maximo: 3, nombres });
            return destino === 'en' ? vinetas : await ports.traduccion.traducir('en', destino, vinetas);
        } catch (fallo) {
            // Sin el idioma descargado, sin red para bajarlo… se dice y se usan
            // las frases clave, que siempre funcionan.
            setError(mensajeDeError(fallo, de));
            return frasesClave(texto, { maximo: 3, nombres });
        }
    };

    const activarIa = async () => {
        setPreparandoIa(true);
        try {
            await ports.resumen.descargar();
            setIa(await ports.resumen.estado());
        } catch (fallo) {
            setError(fallo?.message || 'No se pudo preparar la IA del teléfono.');
        }
        setPreparandoIa(false);
    };

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <section className="sheet resumen" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Lo que ha pasado hasta aquí">
                <span className="grip" aria-hidden="true" />
                <div className="drawer-head">
                    <h2 className="section-title">Hasta aquí</h2>
                    <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><IconClose size={20} /></button>
                </div>

                <p className="resumen-modo">
                    {ia === 'disponible' && 'Resumido en el teléfono con su IA. Nada después de tu página.'}
                    {(ia === 'no' || ia === 'descargable') && 'Las frases que mejor resumen cada capítulo. Nada después de tu página.'}
                    {ia === 'descargando' && 'El teléfono está preparando su IA. Vuelve en unos minutos.'}
                </p>
                {ia === 'descargable' && (
                    <button type="button" className="btn btn-block" onClick={activarIa} disabled={preparandoIa}>
                        {preparandoIa ? 'Preparando…' : 'Usar la IA del teléfono para resumir'}
                    </button>
                )}
                {error && <p className="ordenar-nota">{error}</p>}

                <ol className="resumen-lista">
                    {capitulos.length === 0 && !error && <li className="card-body">Leyendo lo que llevas…</li>}
                    {capitulos.map((c) => (
                        <li key={c.i} className="resumen-capitulo">
                            <h3 className="resumen-titulo">{c.etiqueta}{c.actual ? ' · hasta aquí' : ''}</h3>
                            {c.vinetas === null ? (
                                <p className="card-body">Resumiendo…</p>
                            ) : (
                                <ul>
                                    {c.vinetas.map((v, i) => <li key={i}>{v}</li>)}
                                </ul>
                            )}
                        </li>
                    ))}
                </ol>
            </section>
        </div>
    );
}
