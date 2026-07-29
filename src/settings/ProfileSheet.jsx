import React, { useState } from 'react';
import Sheet, { Group } from '../ui/Sheet.jsx';
import { usePorts } from '../ports/index.js';
import { resizeCoverDataUrl } from '../core/coverResize.js';

/**
 * Perfil: nombre y avatar.
 *
 * ## Por qué existe
 *
 * La tarjeta de ajustes llevaba un tiburón fijo y ningún nombre. El tiburón es
 * la marca de la app, no el usuario: usarlo como avatar da a entender que no se
 * puede cambiar, y además hace que la app parezca no saber de quién es.
 *
 * Ahora se puede poner nombre —o no— y elegir avatar entre un emoji o una foto
 * propia. Sigue sin haber cuentas ni servidor: esto se guarda en el dispositivo
 * como cualquier otra preferencia y viaja en el backup.
 *
 * ## Por qué la foto se guarda en el propio ajuste
 *
 * Un avatar redimensionado son unas decenas de kilobytes. Guardarlo como fichero
 * aparte obligaría a gestionar su ciclo de vida —borrarlo al cambiarlo, no
 * dejarlo huérfano al restaurar un backup— para ahorrar un espacio que no
 * importa. Se reutiliza `coverResize` del núcleo, que es el mismo código que
 * recorta las portadas.
 */

/** Emojis de partida. Ni banderas ni caras concretas: no representan a nadie. */
export const AVATAR_EMOJIS = [
    '🦈', '📚', '🐙', '🦉', '🌙', '☕', '🪐', '🍂',
    '🎧', '🖋️', '🗝️', '🧭', '🕯️', '🫧', '🐈', '🦊',
];

/** Lado del avatar guardado, en píxeles. Se muestra a 56, con margen para retina. */
const AVATAR_SIZE = 160;

export default function ProfileSheet({ profile, onChange, onClose }) {
    const ports = usePorts();
    const [name, setName] = useState(profile?.name || '');
    const [error, setError] = useState(null);

    const save = (changes) => onChange({ ...profile, ...changes });

    const pickPhoto = async () => {
        setError(null);
        try {
            const picked = await ports.filePicker.pickImage();
            if (!picked?.dataUrl) return;
            const resized = await resizeCoverDataUrl(picked.dataUrl, { maxDim: AVATAR_SIZE });
            save({ photo: resized, emoji: null });
        } catch (failure) {
            setError(failure?.message || 'No se pudo usar esa imagen.');
        }
    };

    return (
        <Sheet title="Tu perfil" onClose={onClose}>
            {() => (
                <>
                    <div className="profile-edit">
                        <span className="profile-avatar lg">
                            {profile?.photo
                                ? <img src={profile.photo} alt="" />
                                : <span aria-hidden="true">{profile?.emoji || '🦈'}</span>}
                        </span>
                        <div className="profile-edit-txt">
                            <b>{name.trim() || 'Sin nombre'}</b>
                            <span>Solo se guarda en este dispositivo.</span>
                        </div>
                    </div>

                    <Group
                        label="Nombre"
                        hint="Opcional. Si lo dejas vacío, la app no te llama de ninguna manera."
                    >
                        <input
                            className="text-input"
                            type="text"
                            placeholder="Tu nombre"
                            value={name}
                            maxLength={32}
                            onChange={(event) => setName(event.target.value)}
                            // Se guarda al salir del campo, no en cada pulsación:
                            // escribir ocho letras no debería ser ocho escrituras
                            // en la base de datos.
                            onBlur={() => save({ name: name.trim() })}
                            aria-label="Tu nombre"
                        />
                    </Group>

                    <Group label="Avatar">
                        <div className="avatar-grid">
                            {AVATAR_EMOJIS.map((emoji) => (
                                <button
                                    key={emoji}
                                    type="button"
                                    className={`avatar-option${!profile?.photo && (profile?.emoji || '🦈') === emoji ? ' on' : ''}`}
                                    onClick={() => save({ emoji, photo: null })}
                                    aria-label={`Usar ${emoji}`}
                                    aria-pressed={!profile?.photo && profile?.emoji === emoji}
                                >
                                    <span aria-hidden="true">{emoji}</span>
                                </button>
                            ))}
                        </div>

                        <button type="button" className="btn btn-block" onClick={pickPhoto}>
                            Elegir una foto
                        </button>

                        {profile?.photo && (
                            <button
                                type="button"
                                className="btn btn-block"
                                onClick={() => save({ photo: null })}
                            >
                                Quitar la foto
                            </button>
                        )}

                        {error && <p className="warn-note">{error}</p>}
                    </Group>
                </>
            )}
        </Sheet>
    );
}
