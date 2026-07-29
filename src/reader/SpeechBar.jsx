import React, { useState } from 'react';
import { SPEECH_RATES } from '../adapters/AndroidTts.js';
import { IconVolume, IconClose } from '../ui/icons.jsx';

/**
 * Controles de lectura en voz alta.
 *
 * Aparece anclada abajo cuando la voz está activa, por encima de la barra del
 * lector. Es el patrón de reproductor: mientras suena algo, el control de eso
 * que suena tiene prioridad sobre el resto de la interfaz.
 */
export default function SpeechBar({ speech, onClose }) {
    const [showSettings, setShowSettings] = useState(false);
    const { state, settings, voices, updateSettings } = speech;

    return (
        <>
            <div className="speechbar" role="region" aria-label="Lectura en voz alta">
                <span className="speech-icon" aria-hidden="true"><IconVolume size={20} /></span>

                <div className="speech-info">
                    <span className="speech-state">
                        {state === 'speaking' ? 'Leyendo en voz alta' : 'En pausa'}
                    </span>
                    <button
                        type="button"
                        className="link-btn speech-cfg"
                        onClick={() => setShowSettings(true)}
                    >
                        {settings.rate}× · {voices.find((v) => v.id === settings.voiceId)?.name || 'Voz del sistema'}
                    </button>
                </div>

                <button
                    type="button"
                    className="speech-play"
                    onClick={speech.toggle}
                    aria-label={state === 'speaking' ? 'Pausar' : 'Reanudar'}
                >
                    {state === 'speaking' ? (
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                    ) : (
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
                    )}
                </button>

                <button type="button" className="icon-btn" onClick={onClose} aria-label="Detener la lectura">
                    <IconClose size={20} />
                </button>
            </div>

            {showSettings && (
                <div className="scrim" onClick={() => setShowSettings(false)} role="presentation">
                    <section className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Ajustes de voz">
                        <span className="grip" aria-hidden="true" />

                        <div className="setting">
                            <span className="setting-label">
                                Velocidad
                                <span className="setting-value">{settings.rate}×</span>
                            </span>
                            <div className="segmented">
                                {SPEECH_RATES.map((rate) => (
                                    <button
                                        key={rate}
                                        type="button"
                                        className={settings.rate === rate ? 'on' : ''}
                                        onClick={() => updateSettings({ rate })}
                                    >
                                        {rate}×
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="setting">
                            <span className="setting-label">Voz</span>
                            {voices.length === 0 ? (
                                <p className="card-body">
                                    Android no ha devuelto ninguna voz. Instala un motor de
                                    síntesis desde los ajustes del sistema para poder usar
                                    esta función.
                                </p>
                            ) : (
                                <div className="rows">
                                    <button
                                        type="button"
                                        className="row"
                                        onClick={() => updateSettings({ voiceId: null })}
                                    >
                                        <span className="row-txt"><span>Voz del sistema</span></span>
                                        {settings.voiceId === null && <span className="row-val">✓</span>}
                                    </button>
                                    {voices.slice(0, 12).map((voice) => (
                                        <button
                                            key={voice.id}
                                            type="button"
                                            className="row"
                                            onClick={() => updateSettings({ voiceId: voice.id })}
                                        >
                                            <span className="row-txt">
                                                <span>{voice.name}</span>
                                                <span className="row-sub">{voice.lang}</span>
                                            </span>
                                            {settings.voiceId === voice.id && <span className="row-val">✓</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button type="button" className="btn btn-primary btn-block" onClick={() => setShowSettings(false)}>
                            Listo
                        </button>
                    </section>
                </div>
            )}
        </>
    );
}
