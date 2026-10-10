import React, { useEffect, useState } from 'react';
import { usePorts } from '../ports/index.js';
import { VOCES_LOCALES } from '../adapters/VozLocal.js';
import { useBackHandler } from '../ui/useBackHandler.js';
import { IconClose, IconDownload, IconTrash, IconCheck } from '../ui/icons.jsx';

const IDIOMAS = { es: 'Español', en: 'Inglés', fr: 'Francés', de: 'Alemán', pt: 'Portugués' };

/**
 * Voces naturales sin conexión: descargar y borrar.
 *
 * Cada voz son unos 70 MB, así que se baja solo la que se quiere, con aviso del
 * tamaño antes y avance durante. Después funciona sin internet y gratis.
 */
export default function VocesSheet({ onClose, onCambio }) {
    const ports = usePorts();
    const local = ports.tts?.local;
    const [instaladas, setInstaladas] = useState([]);
    const [bajando, setBajando] = useState(null);
    const [error, setError] = useState(null);

    useBackHandler(() => { onClose(); return true; });

    const refrescar = async () => setInstaladas(await local?.instaladas?.() || []);
    useEffect(() => { refrescar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const descargar = async (voz) => {
        setError(null);
        setBajando({ id: voz.id, fase: 'descargando', hecho: 0, total: voz.mb * 1e6 });
        try {
            await local.descargar(voz.id, (datos) => setBajando({ id: voz.id, ...datos }));
            await refrescar();
            onCambio?.();
        } catch (fallo) {
            setError(String(fallo?.message || '').includes('cancelada') ? null : 'No se pudo descargar la voz. Comprueba la conexión.');
        }
        setBajando(null);
    };

    const borrar = async (voz) => {
        await local.borrar(voz.id).catch(() => {});
        await refrescar();
        onCambio?.();
    };

    const porIdioma = Object.entries(IDIOMAS)
        .map(([id, nombre]) => [nombre, VOCES_LOCALES.filter((v) => v.idioma === id)])
        .filter(([, voces]) => voces.length);

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <section className="sheet voces" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Voces naturales">
                <span className="grip" aria-hidden="true" />
                <div className="drawer-head">
                    <h2 className="section-title">Voces naturales</h2>
                    <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><IconClose size={20} /></button>
                </div>
                <p className="card-body">
                    Suenan como una persona y funcionan sin internet: la voz se genera en el teléfono.
                    Se descargan una vez, unos 70 MB cada una.
                </p>
                {!local && <p className="card-body">Este dispositivo no admite voces naturales.</p>}
                {error && <p className="banner banner-error" role="alert">{error}</p>}

                <div className="voces-lista">
                    {porIdioma.map(([idioma, voces]) => (
                        <section key={idioma} className="voces-grupo">
                            <h3 className="voces-idioma">{idioma}</h3>
                            {voces.map((voz) => {
                                const tiene = instaladas.includes(voz.id);
                                const esta = bajando?.id === voz.id;
                                const avance = esta && bajando.total ? Math.min(100, Math.round((bajando.hecho / bajando.total) * 100)) : 0;
                                return (
                                    <div key={voz.id} className="voz-fila">
                                        <span className="voz-txt">
                                            <span className="voz-nombre">{voz.nombre} {tiene && <IconCheck size={14} />}</span>
                                            <span className="voz-meta">
                                                {voz.acento} · voz {voz.voz} · {voz.mb} MB · {voz.licencia}
                                            </span>
                                            {esta && (
                                                <span className="voz-avance">
                                                    <span className="bar thin"><i style={{ width: `${bajando.fase === 'instalando' ? 100 : avance}%` }} /></span>
                                                    <span>{bajando.fase === 'instalando' ? 'Instalando…' : `${avance} %`}</span>
                                                </span>
                                            )}
                                        </span>
                                        {esta ? (
                                            <button type="button" className="btn" onClick={() => local.cancelarDescarga()}>Cancelar</button>
                                        ) : tiene ? (
                                            <button type="button" className="icon-btn" onClick={() => borrar(voz)} aria-label={`Borrar la voz ${voz.nombre}`}>
                                                <IconTrash size={18} />
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="icon-btn"
                                                onClick={() => descargar(voz)}
                                                disabled={Boolean(bajando) || !local}
                                                aria-label={`Descargar la voz ${voz.nombre}, ${voz.mb} megas`}
                                            >
                                                <IconDownload size={18} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </section>
                    ))}
                </div>
                <p className="ordenar-nota">
                    Voces Piper (sherpa-onnx). Solo se ofrecen voces con licencia libre para su uso. Sharvard: Sharvard
                    Corpus, Universidad de Edimburgo (CC BY 3.0). Siwis: SIWIS French Speech Synthesis Database (CC BY 4.0).
                </p>
            </section>
        </div>
    );
}
