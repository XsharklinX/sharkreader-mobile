import React, { useEffect, useState } from 'react';
import { lookupWord, addToVocabulary, DICTIONARY_LANGS } from './dictionary.js';
import { usePorts } from '../ports/index.js';
import { IconClose, IconPlus, IconCheck } from '../ui/icons.jsx';

/**
 * Ficha de diccionario.
 *
 * Sube al tocar dos veces una palabra o desde la barra de selección. Guardar en
 * el vocabulario está a un toque porque es lo que convierte el diccionario en
 * una herramienta de estudio en lugar de una consulta suelta.
 */
export default function DictionarySheet({ word, frase = '', book, onClose }) {
    const ports = usePorts();
    const [lang, setLang] = useState('es');
    const [state, setState] = useState('loading');
    const [entry, setEntry] = useState(null);
    const [offline, setOffline] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        let alive = true;
        setState('loading');
        setSaved(false);

        lookupWord(ports.storage, word, lang).then((result) => {
            if (!alive) return;
            setEntry(result.entry);
            setOffline(result.offline);
            setState(result.entry ? 'ready' : 'empty');
        });

        return () => { alive = false; };
    }, [word, lang, ports]);

    const save = async () => {
        await addToVocabulary(ports.storage, {
            word,
            lang,
            definition: entry?.meanings?.[0]?.definitions?.[0]?.text || '',
            bookId: book?.id || '',
            bookName: book?.name || '',
            frase,
        });
        setSaved(true);
    };

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <section
                className="sheet"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label={`Definición de ${word}`}
            >
                <span className="grip" aria-hidden="true" />

                <div className="dict-head">
                    <div className="dict-word">
                        <h2 className="detail-title">{entry?.word || word}</h2>
                        {entry?.phonetic && <span className="dict-phonetic mono">{entry.phonetic}</span>}
                    </div>
                    <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
                        <IconClose size={20} />
                    </button>
                </div>

                <div className="pills">
                    {DICTIONARY_LANGS.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className={`pill${lang === option.id ? ' on' : ''}`}
                            onClick={() => setLang(option.id)}
                            aria-pressed={lang === option.id}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>

                {state === 'loading' && <p className="card-body">Buscando…</p>}

                {state === 'empty' && (
                    <p className="card-body">
                        {offline
                            ? 'No hay conexión y esta palabra no está en la caché. Las que ya has consultado siguen disponibles sin red.'
                            : `«${word}» no aparece en el diccionario de ${DICTIONARY_LANGS.find((l) => l.id === lang)?.label.toLowerCase()}. Prueba con otro idioma.`}
                    </p>
                )}

                {state === 'ready' && entry.meanings.map((meaning, index) => (
                    <section className="dict-meaning" key={index}>
                        {meaning.partOfSpeech && (
                            <span className="dict-pos">{meaning.partOfSpeech}</span>
                        )}
                        <ol className="dict-defs">
                            {meaning.definitions.map((definition, defIndex) => (
                                <li key={defIndex}>
                                    {definition.text}
                                    {definition.example && (
                                        <span className="dict-example">«{definition.example}»</span>
                                    )}
                                </li>
                            ))}
                        </ol>
                        {meaning.synonyms.length > 0 && (
                            <div className="detail-tags">
                                {meaning.synonyms.map((synonym) => (
                                    <span className="tag" key={synonym}>{synonym}</span>
                                ))}
                            </div>
                        )}
                    </section>
                ))}

                {state === 'ready' && (
                    <button
                        type="button"
                        className={`btn btn-block${saved ? '' : ' btn-primary'}`}
                        onClick={save}
                        disabled={saved}
                    >
                        {saved ? <><IconCheck size={18} /> En tu vocabulario</> : <><IconPlus size={18} /> Guardar en vocabulario</>}
                    </button>
                )}
            </section>
        </div>
    );
}
