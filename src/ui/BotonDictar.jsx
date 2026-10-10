import React, { useEffect, useRef, useState } from 'react';
import { registerPlugin } from '@capacitor/core';

/**
 * Dictar una nota. Ver `SharkDictadoPlugin.java`.
 *
 * Un botón que escucha y añade lo dicho al final de la nota. Mientras habla, lo
 * que se va reconociendo se enseña debajo, para saber que está funcionando sin
 * esperar al final.
 */
const SharkDictado = registerPlugin('SharkDictado');

let disponibleCache = null;
/** ¿Se puede dictar en este teléfono? Se pregunta una vez. */
export const puedeDictar = () => {
    if (!disponibleCache) {
        disponibleCache = SharkDictado.disponible()
            .then((r) => Boolean(r?.disponible))
            .catch(() => false);
    }
    return disponibleCache;
};

/** Junta lo dictado con lo que ya había escrito. */
export const anadirDictado = (anterior, dictado) => {
    const limpio = String(dictado || '').trim();
    if (!limpio) return anterior;
    const frase = limpio.charAt(0).toLocaleUpperCase('es') + limpio.slice(1);
    const base = String(anterior || '').trimEnd();
    if (!base) return frase;
    return /[.!?…]$/.test(base) ? `${base} ${frase}` : `${base}. ${frase}`;
};

export default function BotonDictar({ valor, onCambio, idioma = 'es-ES' }) {
    const [disponible, setDisponible] = useState(false);
    const [escuchando, setEscuchando] = useState(false);
    const [parcial, setParcial] = useState('');
    const [error, setError] = useState(null);
    const valorRef = useRef(valor);
    valorRef.current = valor;

    useEffect(() => { puedeDictar().then(setDisponible); }, []);

    if (!disponible) return null;

    const dictar = async () => {
        if (escuchando) {
            SharkDictado.parar().catch(() => {});
            return;
        }
        setError(null);
        setParcial('');
        setEscuchando(true);
        const oyente = await SharkDictado.addListener('parcial', (datos) => setParcial(datos?.parcial || ''));
        try {
            const { texto } = await SharkDictado.escuchar({ idioma });
            onCambio(anadirDictado(valorRef.current, texto));
        } catch (fallo) {
            setError(fallo?.message || 'No se ha podido dictar.');
        } finally {
            oyente.remove?.();
            setEscuchando(false);
            setParcial('');
        }
    };

    return (
        <div className="dictar">
            <button
                type="button"
                className={`dictar-boton${escuchando ? ' on' : ''}`}
                onClick={dictar}
                aria-pressed={escuchando}
            >
                <span className="dictar-punto" aria-hidden="true" />
                {escuchando ? 'Escuchando… toca para terminar' : 'Dictar la nota'}
            </button>
            {parcial && <p className="dictar-parcial">{parcial}</p>}
            {error && <p className="dictar-error" role="alert">{error}</p>}
        </div>
    );
}
