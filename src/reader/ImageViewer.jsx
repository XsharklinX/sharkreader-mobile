import React, { useRef, useState } from 'react';
import { IconClose } from '../ui/icons.jsx';

/**
 * Visor de imágenes a pantalla completa.
 *
 * Mapas, esquemas y tablas en imagen se ven al ancho de la columna, que en un
 * móvil es ilegible. Aquí se abren enteros y se pueden ampliar.
 *
 * El zoom se hace con pellizco y con doble toque. El doble toque importa más de
 * lo que parece: es el gesto que la gente prueba primero, y sin él la sensación
 * es que la imagen «no hace nada».
 */
const MAX_SCALE = 5;

export default function ImageViewer({ src, alt, onClose }) {
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const gesture = useRef(null);

    const distance = (touches) => Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
    );

    const handleTouchStart = (event) => {
        if (event.touches.length === 2) {
            gesture.current = {
                type: 'pinch',
                startDistance: distance(event.touches),
                startScale: scale,
            };
        } else if (event.touches.length === 1 && scale > 1) {
            // Con la imagen ampliada, un dedo desplaza en lugar de cerrar.
            gesture.current = {
                type: 'pan',
                x: event.touches[0].clientX - offset.x,
                y: event.touches[0].clientY - offset.y,
            };
        }
    };

    const handleTouchMove = (event) => {
        const current = gesture.current;
        if (!current) return;

        if (current.type === 'pinch' && event.touches.length === 2) {
            const ratio = distance(event.touches) / current.startDistance;
            setScale(Math.min(MAX_SCALE, Math.max(1, current.startScale * ratio)));
        } else if (current.type === 'pan' && event.touches.length === 1) {
            setOffset({
                x: event.touches[0].clientX - current.x,
                y: event.touches[0].clientY - current.y,
            });
        }
    };

    const handleTouchEnd = () => {
        gesture.current = null;
        // Al volver al tamaño original se recentra: si no, la imagen se queda
        // desplazada fuera de la pantalla y parece que ha desaparecido.
        if (scale <= 1.02) {
            setScale(1);
            setOffset({ x: 0, y: 0 });
        }
    };

    const toggleZoom = () => {
        if (scale > 1) {
            setScale(1);
            setOffset({ x: 0, y: 0 });
        } else {
            setScale(2.5);
        }
    };

    return (
        <div className="image-viewer" role="dialog" aria-label={alt || 'Imagen'}>
            <button
                type="button"
                className="icon-btn image-viewer-close"
                onClick={onClose}
                aria-label="Cerrar"
            >
                <IconClose size={22} />
            </button>

            <div
                className="image-viewer-stage"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onDoubleClick={toggleZoom}
                // Con la imagen a tamaño original, tocar el fondo cierra. Es el
                // gesto que se espera de un visor a pantalla completa.
                onClick={() => { if (scale <= 1) onClose(); }}
            >
                <img
                    src={src}
                    alt={alt || ''}
                    draggable={false}
                    style={{
                        transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                        transition: gesture.current ? 'none' : 'transform 0.2s ease',
                    }}
                />
            </div>

            {scale > 1 && (
                <span className="image-viewer-hint mono">{Math.round(scale * 100)}%</span>
            )}
        </div>
    );
}
