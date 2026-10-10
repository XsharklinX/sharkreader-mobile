import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePorts } from '../ports/index.js';
import { readBookBlob } from '../adapters/SafPicker.js';
import { readEpubChapters } from '../library/useContentIndex.js';
import {
    VERSION_PERSONAJES, analizarLibro, hastaAqui, contarEn, frasesCon, textoConParrafos,
} from './personajes.js';
import { useBackHandler } from '../ui/useBackHandler.js';
import { IconArrowLeft, IconClose } from '../ui/icons.jsx';

const CLAVE = (id) => `personajes:${id}`;

/** El último tramo de la ruta: el spine y el OPF no siempre escriben la ruta igual. */
const nombreDe = (href = '') => decodeURIComponent(String(href).split('#')[0]).split('/').pop();

/**
 * Personajes y lugares, solo hasta donde vas. Ver `personajes.js`.
 *
 * La primera vez que se abre en un libro se lee el EPUB entero y se cuentan los
 * nombres (medio segundo en un libro largo); el resultado se guarda y las
 * siguientes veces sale al instante. Los textos de los capítulos se quedan en
 * memoria mientras el libro está abierto, para las frases de cada ficha.
 */
export default function PersonajesSheet({ book, engine, location, toc = [], buscado, onJump, onClose }) {
    const ports = usePorts();
    const [analisis, setAnalisis] = useState(null);
    const [hrefs, setHrefs] = useState([]);
    const [error, setError] = useState(null);
    const [pestana, setPestana] = useState('personaje');
    const [elegido, setElegido] = useState(null);
    const textos = useRef(null);

    useBackHandler(() => {
        if (elegido) { setElegido(null); return true; }
        onClose();
        return true;
    });

    // ── Cargar o calcular ────────────────────────────────────────────────────
    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const guardado = await ports.storage.getSetting(CLAVE(book.id)).catch(() => null);
                if (guardado?.version === VERSION_PERSONAJES && Array.isArray(guardado.analisis)) {
                    if (!vivo) return;
                    setHrefs(guardado.hrefs || []);
                    setAnalisis(guardado.analisis);
                    return;
                }
                const capitulos = await readEpubChapters(await readBookBlob(book.sourcePath));
                const lista = capitulos.map((c) => textoConParrafos(c.html));
                textos.current = lista;
                const resultado = analizarLibro(lista);
                const lugares = capitulos.map((c) => c.href);
                if (!vivo) return;
                setHrefs(lugares);
                setAnalisis(resultado);
                ports.storage.setSetting(CLAVE(book.id), {
                    version: VERSION_PERSONAJES, hrefs: lugares, analisis: resultado,
                }).catch(() => {});
            } catch {
                if (vivo) setError('No se ha podido leer este libro para buscar personajes.');
            }
        })();
        return () => { vivo = false; };
    }, [book.id, book.sourcePath, ports]);

    /** Los textos solo hacen falta para las frases; se leen al pedir una ficha. */
    const asegurarTextos = async () => {
        if (textos.current) return textos.current;
        const capitulos = await readEpubChapters(await readBookBlob(book.sourcePath));
        textos.current = capitulos.map((c) => textoConParrafos(c.html));
        return textos.current;
    };

    // ── Dónde vas ────────────────────────────────────────────────────────────
    const capituloActual = useMemo(() => {
        const actual = engine?.capituloDe(location?.cfi);
        if (!actual) return 0;
        const i = hrefs.findIndex((h) => nombreDe(h) === nombreDe(actual.href));
        return i >= 0 ? i : 0;
    }, [engine, location?.cfi, hrefs]);

    const textoActual = useMemo(() => engine?.textoHastaAqui?.() || '', [engine, location?.cfi]);

    const visibles = useMemo(() => {
        if (!analisis) return [];
        const cuenta = contarEn(textoActual, analisis.map((d) => d.nombre));
        return hastaAqui(analisis, capituloActual, cuenta);
    }, [analisis, capituloActual, textoActual]);

    // Si se llegó aquí desde una selección («¿Quién es?»), se abre su ficha.
    useEffect(() => {
        if (!buscado || !visibles.length || elegido) return;
        const limpio = buscado.trim().toLocaleLowerCase('es');
        const encontrado = visibles.find((d) => d.nombre.toLocaleLowerCase('es') === limpio)
            || visibles.find((d) => d.nombre.toLocaleLowerCase('es').split(' ').includes(limpio));
        if (encontrado) setElegido(encontrado.nombre);
        // Solo la primera vez.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [buscado, visibles]);

    const etiquetaDe = (indice) => {
        const href = hrefs[indice];
        const entrada = toc.find((t) => nombreDe(t.href) === nombreDe(href));
        return entrada?.label || `Capítulo ${indice + 1}`;
    };

    const lista = visibles.filter((d) => d.tipo === pestana);

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <section className="sheet personajes" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Personajes y lugares">
                <span className="grip" aria-hidden="true" />
                <div className="drawer-head">
                    {elegido && (
                        <button type="button" className="icon-btn" onClick={() => setElegido(null)} aria-label="Volver a la lista">
                            <IconArrowLeft size={20} />
                        </button>
                    )}
                    <h2 className="section-title">{elegido || 'En este libro'}</h2>
                    <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
                        <IconClose size={20} />
                    </button>
                </div>

                {error && <p className="card-body">{error}</p>}
                {!error && !analisis && <p className="card-body">Leyendo el libro para encontrar personajes…</p>}

                {analisis && !elegido && (
                    <>
                        <div className="personajes-pestanas" role="tablist">
                            {[['personaje', 'Personajes'], ['lugar', 'Lugares']].map(([id, texto]) => (
                                <button
                                    key={id}
                                    type="button"
                                    role="tab"
                                    aria-selected={pestana === id}
                                    className={`personajes-pestana${pestana === id ? ' on' : ''}`}
                                    onClick={() => setPestana(id)}
                                >
                                    {texto}
                                </button>
                            ))}
                        </div>
                        <ul className="personajes-lista">
                            {lista.length === 0 && (
                                <li className="card-body">
                                    {pestana === 'lugar' ? 'Todavía no ha salido ningún lugar.' : 'Todavía no ha salido nadie.'}
                                </li>
                            )}
                            {lista.map((d) => {
                                const maximo = Math.max(1, ...d.porCapitulo);
                                return (
                                    <li key={d.nombre}>
                                        <button type="button" className="personaje-fila" onClick={() => setElegido(d.nombre)}>
                                            <span className="personaje-cabeza">
                                                <span className="personaje-nombre">{d.nombre}</span>
                                                <span className="personaje-cuenta">
                                                    {d.total} {d.total === 1 ? 'vez' : 'veces'} · desde {etiquetaDe(d.primero)}
                                                </span>
                                            </span>
                                            {/* Cuándo sale, capítulo a capítulo, hasta el actual. */}
                                            <span className="personaje-barras" aria-hidden="true">
                                                {d.porCapitulo.map((n, i) => (
                                                    <i key={i} style={{ height: `${n ? 18 + (n / maximo) * 82 : 6}%`, opacity: n ? 0.85 : 0.18 }} />
                                                ))}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                        <p className="personajes-nota">
                            Solo hasta la página en la que vas: lo que pase después no aparece aquí.
                        </p>
                    </>
                )}

                {analisis && elegido && (
                    <Ficha
                        nombre={elegido}
                        capitulo={capituloActual}
                        textoActual={textoActual}
                        asegurarTextos={asegurarTextos}
                        etiquetaDe={etiquetaDe}
                        onIr={async (indice, frase) => {
                            const href = hrefs[indice];
                            const cfi = await engine?.buscarEnCapitulo(href, frase);
                            onJump(cfi || href);
                        }}
                    />
                )}
            </section>
        </div>
    );
}

function Ficha({ nombre, capitulo, textoActual, asegurarTextos, etiquetaDe, onIr }) {
    const [frases, setFrases] = useState(null);

    useEffect(() => {
        let vivo = true;
        asegurarTextos().then((todos) => {
            if (!vivo) return;
            // Los capítulos anteriores enteros y el actual hasta donde vas.
            const leidos = [...todos.slice(0, capitulo), textoActual];
            setFrases(frasesCon(leidos, nombre));
        }).catch(() => { if (vivo) setFrases([]); });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nombre, capitulo, textoActual]);

    if (!frases) return <p className="card-body">Buscando dónde sale…</p>;
    if (!frases.length) return <p className="card-body">No se han encontrado frases hasta aquí.</p>;

    return (
        <ul className="personajes-frases">
            {frases.map((f, i) => (
                <li key={`${f.capitulo}-${i}`}>
                    <button type="button" className="personaje-frase" onClick={() => onIr(f.capitulo, f.frase)}>
                        <span className="personaje-donde">{i === 0 ? 'Primera vez · ' : ''}{etiquetaDe(f.capitulo)}</span>
                        <span className="personaje-texto">«{f.frase}»</span>
                    </button>
                </li>
            ))}
        </ul>
    );
}
