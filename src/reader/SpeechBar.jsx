import React from 'react';
import { IconVolume, IconClose } from '../ui/icons.jsx';

/**
 * Controles de lectura en voz alta.
 *
 * Aparece anclada abajo cuando la voz está activa, por encima de la barra del
 * lector. Es el patrón de reproductor: mientras suena algo, el control de eso
 * que suena tiene prioridad sobre el resto de la interfaz.
 *
 * Solo tres cosas: qué suena, pausa y parar. Todo lo demás —velocidad, voz,
 * temporizador, la frase escrita— vive en `SpeechSheet`, que se abre tocando la
 * información. Aquí no cabe y en una barra de 56 px de alto tampoco debería.
 */
export default function SpeechBar({ speech, onExpand, onClose }) {
    const { state, settings, voices } = speech;

    return (
        <div className="speechbar" role="region" aria-label="Lectura en voz alta">
            {/* Toda la zona de información abre los controles. Antes solo lo
                hacía un enlace de texto de dos palabras. */}
            <button type="button" className="speech-open" onClick={onExpand}>
                <span className="speech-icon" aria-hidden="true"><IconVolume size={20} /></span>
                <span className="speech-info">
                    <span className="speech-state">
                        {state === 'speaking' ? 'Leyendo en voz alta' : 'En pausa'}
                    </span>
                    <span className="speech-cfg">
                        {settings.rate}× · {voices.find((v) => v.id === settings.voiceId)?.name || 'Voz del sistema'}
                    </span>
                </span>
            </button>

            <button
                type="button"
                className="speech-play"
                onClick={speech.toggle}
                aria-label={state === 'speaking' ? 'Pausar' : 'Reanudar'}
            >
                {state === 'speaking' ? (
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                ) : (
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
                )}
            </button>

            <button type="button" className="icon-btn" onClick={onClose} aria-label="Detener la lectura">
                <IconClose size={20} />
            </button>
        </div>
    );
}
