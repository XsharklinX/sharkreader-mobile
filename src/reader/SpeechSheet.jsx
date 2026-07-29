import React from 'react';
import Sheet, { Row, Group, Segmented } from '../ui/Sheet.jsx';
import { SPEECH_RATES } from '../adapters/AndroidTts.js';
import { IconVolume } from '../ui/icons.jsx';

/**
 * Hoja de lectura en voz alta.
 *
 * ## Qué cambió en el rediseño
 *
 * Antes había una barra estrecha —icono, estado, play pequeño— y los ajustes de
 * voz enterrados detrás de un enlace de texto que decía «1,2× · Elvira». Tres
 * problemas:
 *
 *  1. **El play era del tamaño de un icono de barra.** Es el 90 % de los toques
 *     de esta pantalla y competía en tamaño con el botón de cerrar.
 *  2. **No se veía qué estaba sonando.** El resaltado dentro del libro ya
 *     existe, pero si has salido a otra página o has bajado el brillo no sirve
 *     de nada.
 *  3. **El temporizador de apagado estaba en el segundo nivel.** Quien escucha
 *     para dormirse lo usa todas las noches.
 *
 * La barra estrecha sigue existiendo para cuando la voz suena de fondo; esto es
 * lo que se abre al tocarla.
 */

/**
 * Onda de sonido.
 *
 * **No es un análisis del audio.** El motor de voz de Android no expone la
 * amplitud, y el proxy neuronal devuelve un MP3 ya renderizado: leerlo con
 * WebAudio para dibujar quince barras costaría más que la propia síntesis.
 *
 * Es una animación que indica «esto está sonando», del mismo modo que un
 * indicador de carga no mide nada. Se para en seco al pausar, que es la única
 * información que de verdad transmite. Con `prefers-reduced-motion` se queda
 * quieta y el estado lo dice el texto.
 */
const Waveform = ({ active }) => (
    <div className={`waveform${active ? ' on' : ''}`} aria-hidden="true">
        {[38, 62, 88, 44, 70, 36, 54, 24, 68, 40, 78, 32, 58, 46, 26].map((height, index) => (
            <i
                key={index}
                style={{
                    height: `${height}%`,
                    // Desfase por barra: sin él las quince suben y bajan juntas y
                    // parece un solo bloque latiendo.
                    animationDelay: `${(index % 5) * 0.11}s`,
                }}
            />
        ))}
    </div>
);

const SLEEP_OPTIONS = [
    { value: 0, label: 'No' },
    { value: 15, label: '15' },
    { value: 30, label: '30' },
    { value: 45, label: '45' },
    { value: 60, label: '60' },
];

export default function SpeechSheet({ speech, sentence, chapter, onClose }) {
    const { state, settings, voices, updateSettings, sleepAt, setSleepTimer } = speech;
    const speaking = state === 'speaking';

    const currentVoice = voices.find((voice) => voice.id === settings.voiceId);
    const minutesLeft = sleepAt
        ? Math.max(0, Math.round((sleepAt - Date.now()) / 60_000))
        : 0;

    const pages = {
        voice: {
            title: 'Voz',
            render: () => (
                <>
                    {voices.length === 0 ? (
                        <p className="option-desc">
                            No hay voces instaladas en el sistema. Se instalan desde los
                            ajustes de Android, en «Salida de texto a voz».
                        </p>
                    ) : (
                        <div className="option-list">
                            {voices.map((voice) => (
                                <button
                                    key={voice.id}
                                    type="button"
                                    className={`option${settings.voiceId === voice.id ? ' on' : ''}`}
                                    onClick={() => updateSettings({ voiceId: voice.id })}
                                    aria-pressed={settings.voiceId === voice.id}
                                >
                                    <span className="option-txt">
                                        <span className="option-name">{voice.name}</span>
                                        <span className="option-desc">
                                            {voice.lang}
                                            {/* Distinguir de dónde sale cada voz importa:
                                                la neuronal cuesta dinero y necesita red. */}
                                            {voice.engine === 'neural' ? ' · neuronal, por red' : ' · del sistema'}
                                        </span>
                                    </span>
                                    <span className="option-mark" aria-hidden="true" />
                                </button>
                            ))}
                        </div>
                    )}
                </>
            ),
        },
    };

    return (
        <Sheet title="Lectura en voz alta" onClose={onClose} pages={pages}>
            {({ openPage }) => (
                <>
                    {/* El play, grande y a la izquierda. Es el 90 % de los toques. */}
                    <div className="voice-hero">
                        <button
                            type="button"
                            className="voice-play"
                            onClick={speech.toggle}
                            aria-label={speaking ? 'Pausar la lectura' : 'Reanudar la lectura'}
                        >
                            {speaking ? (
                                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
                                    <rect x="7" y="5" width="3.6" height="14" rx="1" />
                                    <rect x="13.4" y="5" width="3.6" height="14" rx="1" />
                                </svg>
                            ) : (
                                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
                                    <path d="M8 5.5v13l11-6.5z" />
                                </svg>
                            )}
                        </button>

                        <div className="voice-txt">
                            <b>{chapter || 'Lectura en voz alta'}</b>
                            <span>
                                {currentVoice?.name || 'Voz del sistema'} · {settings.rate}×
                                {sleepAt ? ` · para en ${minutesLeft} min` : ''}
                            </span>
                        </div>
                    </div>

                    {/* La frase que suena, escrita. Es el motivo por el que alguien
                        mira la pantalla mientras escucha: seguir la lectura sin
                        tener que volver a la página del libro. */}
                    <div className="voice-line" aria-live="polite">
                        {sentence
                            ? <p>{sentence}</p>
                            : <p className="voice-line-empty">
                                {speaking ? 'Preparando…' : 'En pausa'}
                              </p>}
                    </div>

                    <Waveform active={speaking} />

                    <Segmented
                        label="Velocidad"
                        value={settings.rate}
                        options={SPEECH_RATES.map((rate) => ({ value: rate, label: `${rate}×` }))}
                        onChange={(rate) => updateSettings({ rate })}
                    />

                    {/* Temporizador de apagado en primer nivel: quien escucha para
                        dormirse lo usa cada noche. Antes estaba a dos toques. */}
                    <Segmented
                        label="Parar en"
                        value={sleepAt ? SLEEP_OPTIONS.find((o) => o.value >= minutesLeft)?.value ?? 60 : 0}
                        options={SLEEP_OPTIONS}
                        onChange={setSleepTimer}
                        hint="Minutos. Sin esto, quien se duerme escuchando despierta tres
                              capítulos más adelante sin saber por dónde iba."
                    />

                    <div className="rows">
                        <Row
                            icon={<IconVolume size={18} />}
                            label="Voz"
                            hint={currentVoice?.lang || 'La del sistema'}
                            value={currentVoice?.name || 'Sistema'}
                            onClick={() => openPage('voice')}
                        />
                    </div>

                    <button type="button" className="btn btn-block" onClick={speech.stop}>
                        Detener la lectura
                    </button>
                </>
            )}
        </Sheet>
    );
}
