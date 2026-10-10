import React, { useMemo, useRef, useState } from 'react';
import {
    resumirDiagnostico, propuestasLocales, revisarEnLinea, cambiosAplicables,
} from './ordenar.js';
import { searchMetadata, fetchCover } from './metadata.js';
import { resizeCoverDataUrl } from '../core/coverResize.js';
import { IconClose, IconCheck } from '../ui/icons.jsx';
import { useBackHandler } from '../ui/useBackHandler.js';

/**
 * Ordenar la biblioteca: revisar y aplicar en lote.
 *
 * Tres pasos, siempre en este orden: **qué hay mal**, **qué se propone** y
 * **aplicar lo marcado**. Nada se cambia sin pasar por la lista, porque una
 * portada equivocada en cincuenta libros es mucho peor que cincuenta libros sin
 * portada. Ver `ordenar.js`.
 */
export default function OrdenarSheet({ books, onUpdate, onClose }) {
    const [fase, setFase] = useState('inicio');
    const [avance, setAvance] = useState({ hecho: 0, total: 0 });
    const [propuestas, setPropuestas] = useState([]);
    const [marcadas, setMarcadas] = useState(() => new Set());
    const [aviso, setAviso] = useState(null);
    const cancelar = useRef(false);

    const resumen = useMemo(() => resumirDiagnostico(books), [books]);

    useBackHandler(() => {
        if (fase === 'buscando') { cancelar.current = true; return true; }
        onClose();
        return true;
    });

    const mostrar = (lista, mensaje = null) => {
        setPropuestas(lista);
        setMarcadas(new Set(lista.map((p) => p.id)));
        setAviso(mensaje);
        setFase(lista.length ? 'revisar' : 'nada');
    };

    const sinInternet = () => mostrar(propuestasLocales(books));

    const conOpenLibrary = async () => {
        cancelar.current = false;
        setFase('buscando');
        const { propuestas: lista, sinConexion } = await revisarEnLinea({
            libros: books,
            buscar: searchMetadata,
            alAvanzar: (hecho, total) => setAvance({ hecho, total }),
            cancelado: () => cancelar.current,
        });
        mostrar(lista, sinConexion
            ? 'Sin conexión: solo se han podido preparar los arreglos que no necesitan internet.'
            : null);
    };

    const alternar = (id) => setMarcadas((actual) => {
        const siguiente = new Set(actual);
        if (siguiente.has(id)) siguiente.delete(id);
        else siguiente.add(id);
        return siguiente;
    });

    const aplicar = async () => {
        setFase('aplicando');
        const elegidas = propuestas.filter((p) => marcadas.has(p.id));
        let hechas = 0;
        for (const propuesta of elegidas) {
            let portada = null;
            if (propuesta.portadaUrl) {
                const descargada = await fetchCover(propuesta.portadaUrl);
                portada = descargada ? await resizeCoverDataUrl(descargada).catch(() => descargada) : null;
            }
            await onUpdate(propuesta.id, cambiosAplicables(propuesta, portada));
            hechas += 1;
            setAvance({ hecho: hechas, total: elegidas.length });
        }
        setAviso(`${hechas} ${hechas === 1 ? 'libro arreglado' : 'libros arreglados'}.`);
        setFase('hecho');
    };

    return (
        <div className="scrim" onClick={fase === 'buscando' || fase === 'aplicando' ? undefined : onClose} role="presentation">
            <section className="sheet ordenar" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Ordenar la biblioteca">
                <span className="grip" aria-hidden="true" />
                <div className="drawer-head">
                    <h2 className="section-title">Ordenar la biblioteca</h2>
                    <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
                        <IconClose size={20} />
                    </button>
                </div>

                {fase === 'inicio' && (
                    <>
                        {resumen.libros === 0 && resumen.series === 0 ? (
                            <p className="card-body">
                                Todo en orden: ningún libro tiene título de fichero, autor desconocido
                                o falta de portada.
                            </p>
                        ) : (
                            <>
                                <ul className="ordenar-cuenta">
                                    {resumen.titulos > 0 && <li><b>{resumen.titulos}</b> con título de nombre de fichero</li>}
                                    {resumen.autores > 0 && <li><b>{resumen.autores}</b> sin autor</li>}
                                    {resumen.portadas > 0 && <li><b>{resumen.portadas}</b> sin portada</li>}
                                    {resumen.series > 0 && <li><b>{resumen.series}</b> {resumen.series === 1 ? 'serie' : 'series'} sin agrupar</li>}
                                </ul>
                                <p className="card-body">
                                    Antes de cambiar nada verás la lista de cambios y podrás quitar los que no
                                    quieras.
                                </p>
                                <button type="button" className="btn btn-primary btn-block" onClick={conOpenLibrary}>
                                    Buscar títulos, autores y portadas
                                </button>
                                <p className="ordenar-nota">
                                    Se consulta OpenLibrary con el título de cada uno de esos libros. No se envía
                                    nada más.
                                </p>
                                <button type="button" className="btn btn-block" onClick={sinInternet}>
                                    Solo lo que se arregla sin internet
                                </button>
                            </>
                        )}
                    </>
                )}

                {(fase === 'buscando' || fase === 'aplicando') && (
                    <div className="ordenar-progreso" role="status">
                        <span>
                            {fase === 'buscando' ? 'Revisando' : 'Aplicando'} {avance.hecho} de {avance.total || '…'}
                        </span>
                        <span className="bar thin">
                            <i style={{ width: `${avance.total ? (avance.hecho / avance.total) * 100 : 0}%` }} />
                        </span>
                        {fase === 'buscando' && (
                            <button type="button" className="btn" onClick={() => { cancelar.current = true; }}>
                                Parar y ver lo encontrado
                            </button>
                        )}
                    </div>
                )}

                {fase === 'nada' && (
                    <>
                        {aviso && <p className="ordenar-nota">{aviso}</p>}
                        <p className="card-body">
                            No hay nada que se pueda arreglar con seguridad. Los libros que no se han
                            reconocido se quedan como estaban.
                        </p>
                        <button type="button" className="btn btn-block" onClick={onClose}>Cerrar</button>
                    </>
                )}

                {fase === 'revisar' && (
                    <>
                        {aviso && <p className="ordenar-nota">{aviso}</p>}
                        <ul className="ordenar-lista">
                            {propuestas.map((p) => {
                                const on = marcadas.has(p.id);
                                return (
                                    <li key={p.id}>
                                        <button
                                            type="button"
                                            className={`ordenar-item${on ? ' on' : ''}`}
                                            onClick={() => alternar(p.id)}
                                            aria-pressed={on}
                                        >
                                            <span className="ordenar-check" aria-hidden="true">{on && <IconCheck size={14} />}</span>
                                            <span className="ordenar-txt">
                                                <span className="ordenar-antes">{p.actual.name}</span>
                                                <span className="ordenar-despues">
                                                    {p.cambios.name || p.actual.name}
                                                    {p.cambios.author && <> · {p.cambios.author}</>}
                                                </span>
                                                <span className="ordenar-motivos">
                                                    {p.motivos.join(' · ')}
                                                    {p.cambios.series && <> · {p.cambios.series} {p.cambios.seriesIndex}</>}
                                                </span>
                                            </span>
                                            {p.portadaUrl && <img className="ordenar-portada" src={p.portadaUrl} alt="" loading="lazy" />}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                        <div className="sheet-actions">
                            <button type="button" className="btn" onClick={onClose}>Cancelar</button>
                            <button type="button" className="btn btn-primary" onClick={aplicar} disabled={marcadas.size === 0}>
                                Aplicar {marcadas.size}
                            </button>
                        </div>
                    </>
                )}

                {fase === 'hecho' && (
                    <>
                        <p className="card-body">{aviso}</p>
                        <button type="button" className="btn btn-primary btn-block" onClick={onClose}>Listo</button>
                    </>
                )}
            </section>
        </div>
    );
}
