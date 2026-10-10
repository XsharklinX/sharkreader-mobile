import React, { useState } from 'react';
import { usePorts } from '../ports/index.js';
import { readBookBlob } from '../adapters/SafPicker.js';
import { useBackHandler } from '../ui/useBackHandler.js';
import { leerClippingsKindle, leerMetadatosKoreader, formatoDe, emparejar } from './migrar.js';
import { colocarSubrayados } from './colocarSubrayados.js';
import { createHighlight, addAnnotation } from '../reader/annotations.js';
import { IconArrowLeft, IconCheck, IconImport } from '../ui/icons.jsx';

/**
 * Traer de otra app: elegir el fichero, ver qué se va a traer y traerlo.
 *
 * Nada se escribe antes de enseñar la lista: qué libros se han reconocido en tu
 * biblioteca, cuántos subrayados trae cada uno y cuáles se quedan fuera porque
 * el libro no está.
 */
export default function MigrarScreen({ library, onClose }) {
    const ports = usePorts();
    const [fase, setFase] = useState('inicio');
    const [error, setError] = useState(null);
    const [encontrados, setEncontrados] = useState([]);
    const [marcados, setMarcados] = useState(new Set());
    const [avance, setAvance] = useState('');
    const [resumen, setResumen] = useState(null);

    useBackHandler(() => { onClose(); return true; });

    const elegir = async () => {
        setError(null);
        try {
            const elegido = (await ports.filePicker.pickBackup())?.books?.[0];
            if (!elegido) return;
            const texto = await (await readBookBlob(elegido.path)).text();
            // La copia que deja el selector ya no hace falta.
            ports.filePicker.deleteBookFile(elegido.path).catch(() => {});

            const formato = formatoDe(elegido.name, texto);
            let migrados = [];
            if (formato === 'kindle') migrados = leerClippingsKindle(texto);
            if (formato === 'koreader') migrados = [leerMetadatosKoreader(texto)].filter(Boolean);
            if (!formato) {
                setError('Ese fichero no es un My Clippings.txt de Kindle ni unos metadatos de KOReader.');
                return;
            }
            if (!migrados.length) {
                setError('El fichero no trae ningún subrayado.');
                return;
            }

            const lista = migrados.map((m, i) => ({ id: String(i), migrado: m, libro: emparejar(m, library.books) }));
            setEncontrados(lista);
            setMarcados(new Set(lista.filter((e) => e.libro).map((e) => e.id)));
            setFase('revisar');
        } catch (fallo) {
            setError(fallo?.message || 'No se pudo leer el fichero.');
        }
    };

    const traer = async () => {
        setFase('trayendo');
        let colocados = 0;
        let enNotas = 0;
        const elegidos = encontrados.filter((e) => marcados.has(e.id) && e.libro);

        for (const [n, { migrado, libro }] of elegidos.entries()) {
            setAvance(`${n + 1} de ${elegidos.length} · ${libro.name}`);
            let subrayados = migrado.subrayados.map((s) => ({ ...s, cfi: null }));
            if (libro.type === 'epub' && libro.sourcePath) {
                try {
                    subrayados = await colocarSubrayados(await readBookBlob(libro.sourcePath), migrado.subrayados);
                } catch {
                    // Sin poder abrir el libro, todo va a las notas.
                }
            }

            let anotaciones = libro.bookmarks || [];
            const sinSitio = [];
            for (const s of subrayados) {
                if (s.cfi) {
                    anotaciones = addAnnotation(anotaciones, createHighlight({ cfi: s.cfi, text: s.texto, comment: s.nota || '' }));
                    colocados += 1;
                } else if (s.texto || s.nota) {
                    sinSitio.push(`«${s.texto}»${s.nota ? `\n  Nota: ${s.nota}` : ''}`);
                    enNotas += 1;
                }
            }

            const cambios = { bookmarks: anotaciones, annotationsUpdatedAt: Date.now() };
            if (sinSitio.length) {
                const cabecera = `Traídos de otra app sin posición (${new Date().toLocaleDateString('es-ES')}):`;
                cambios.notes = [libro.notes, cabecera, ...sinSitio].filter(Boolean).join('\n\n');
            }
            // KOReader sabe por qué porcentaje ibas: se salta ahí al abrir el
            // libro, cuando ya existe el mapa de posiciones. Solo si allí ibas
            // más adelante que aquí.
            if (migrado.progreso && migrado.progreso > (libro.progress || 0) + 0.005) {
                cambios.readerPreferences = { ...(libro.readerPreferences || {}), irAPorcentaje: migrado.progreso };
            }
            await library.updateBook(libro.id, cambios);
        }

        setResumen({ colocados, enNotas, libros: elegidos.length });
        setFase('hecho');
    };

    const alternar = (id) => setMarcados((actual) => {
        const siguiente = new Set(actual);
        if (siguiente.has(id)) siguiente.delete(id);
        else siguiente.add(id);
        return siguiente;
    });

    return (
        <div className="recibir">
            <header className="recibir-cabecera">
                <button type="button" className="icon-btn" onClick={onClose} aria-label="Volver"><IconArrowLeft size={22} /></button>
                <h1 className="section-title">Traer de otra app</h1>
            </header>

            <div className="recibir-cuerpo">
                {fase === 'inicio' && (
                    <>
                        <p className="card-body">
                            Trae tus subrayados, notas y por dónde ibas. Los libros tienen que estar ya en la
                            biblioteca: cada subrayado se busca en su libro y se coloca en su sitio.
                        </p>
                        <div className="migrar-origen">
                            <h2 className="migrar-titulo">Kindle</h2>
                            <p className="card-body">
                                Conecta el Kindle por cable y copia al móvil el fichero <b>documents/My Clippings.txt</b>.
                                Trae los subrayados y notas de todos tus libros a la vez.
                            </p>
                        </div>
                        <div className="migrar-origen">
                            <h2 className="migrar-titulo">KOReader</h2>
                            <p className="card-body">
                                Junto a cada libro hay una carpeta que acaba en <b>.sdr</b>. Elige el fichero
                                <b> metadata.epub.lua</b> que hay dentro. Trae subrayados, notas y el porcentaje leído.
                            </p>
                        </div>
                        {error && <p className="banner banner-error" role="alert">{error}</p>}
                        <button type="button" className="btn btn-primary btn-block" onClick={elegir}>
                            <IconImport size={18} /> Elegir el fichero
                        </button>
                        <p className="recibir-nota">
                            Moon+ Reader y ReadEra guardan sus copias en formatos propios que cambian entre
                            versiones; por ahora no se pueden leer.
                        </p>
                    </>
                )}

                {fase === 'revisar' && (
                    <>
                        <ul className="ordenar-lista">
                            {encontrados.map(({ id, migrado, libro }) => {
                                const on = marcados.has(id);
                                return (
                                    <li key={id}>
                                        <button
                                            type="button"
                                            className={`ordenar-item${on ? ' on' : ''}`}
                                            onClick={() => libro && alternar(id)}
                                            disabled={!libro}
                                            aria-pressed={on}
                                        >
                                            <span className="ordenar-check" aria-hidden="true">{on && <IconCheck size={14} />}</span>
                                            <span className="ordenar-txt">
                                                <span className="ordenar-despues">{migrado.titulo}</span>
                                                <span className="ordenar-motivos">
                                                    {migrado.subrayados.length} subrayados
                                                    {migrado.progreso ? ` · ${Math.round(migrado.progreso * 100)} %` : ''}
                                                </span>
                                                <span className="ordenar-antes" style={{ textDecoration: 'none' }}>
                                                    {libro ? `En tu biblioteca: ${libro.name}` : 'No está en tu biblioteca'}
                                                </span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                        <div className="sheet-actions">
                            <button type="button" className="btn" onClick={() => setFase('inicio')}>Otro fichero</button>
                            <button type="button" className="btn btn-primary" onClick={traer} disabled={!marcados.size}>
                                Traer {marcados.size} {marcados.size === 1 ? 'libro' : 'libros'}
                            </button>
                        </div>
                    </>
                )}

                {fase === 'trayendo' && (
                    <div className="ordenar-progreso" role="status">
                        <span>Colocando los subrayados en su sitio…</span>
                        <span className="recibir-nota">{avance}</span>
                    </div>
                )}

                {fase === 'hecho' && resumen && (
                    <>
                        <p className="card-body">
                            {resumen.colocados} subrayados colocados en {resumen.libros} {resumen.libros === 1 ? 'libro' : 'libros'}.
                            {resumen.enNotas > 0 && ` ${resumen.enNotas} no se han encontrado en el texto (otra edición, quizá) y están en las notas de cada libro.`}
                        </p>
                        <button type="button" className="btn btn-primary btn-block" onClick={onClose}>Listo</button>
                    </>
                )}
            </div>
        </div>
    );
}
