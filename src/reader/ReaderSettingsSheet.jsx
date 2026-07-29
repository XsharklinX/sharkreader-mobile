import React from 'react';
import Sheet, { Row, Group, Segmented } from '../ui/Sheet.jsx';
import Switch from '../ui/Switch.jsx';
import TypePreview from './TypePreview.jsx';
import {
    FONT_FAMILIES, TYPOGRAPHY_PRESETS,
    applyPreset, matchingPreset, clampFontSize,
    FONT_SIZE_MIN, FONT_SIZE_MAX,
} from './typography.js';

/**
 * Ajustes de **texto**. Solo texto.
 *
 * El tema, la paginación, la animación y el brillo viven en la hoja de pantalla.
 *
 * ## Qué cambió en el rediseño
 *
 * Antes era una lista plana de doce controles con el mismo peso visual: los
 * presets arriba y luego fuente, tamaño, interlineado, márgenes, párrafos,
 * separación, justificar, partir, idioma, capitular y dislexia, uno detrás de
 * otro. Con ocho interruptores apilados ninguno se lee — se recorre la lista
 * buscando el que se quiere y se pasa por delante de los demás sin verlos.
 *
 * Ahora hay tres niveles de intención:
 *
 *  1. **Un preset.** Es lo que quiere la mayoría: «más grande», «más aire».
 *  2. **Fuente y tamaño.** Los dos ajustes que se tocan de verdad a menudo.
 *  3. **Composición y accesibilidad**, detrás de su fila. No se usan menos
 *     porque estén ahí: se usan una vez y se olvidan, que es distinto.
 *
 * Y arriba, una muestra en vivo. Estás componiendo texto: hay que ver texto.
 */

const Stepper = ({ label, value, unit, min, max, step, onChange }) => (
    <Group label={label}>
        <div className="stepper">
            <button
                type="button"
                onClick={() => onChange(value - step)}
                disabled={value <= min}
                aria-label={`Reducir ${label.toLowerCase()}`}
            >
                <span aria-hidden="true">−</span>
            </button>
            <span className="stepper-val">{value}{unit || ''}</span>
            <button
                type="button"
                onClick={() => onChange(value + step)}
                disabled={value >= max}
                aria-label={`Aumentar ${label.toLowerCase()}`}
            >
                <span aria-hidden="true">+</span>
            </button>
        </div>
    </Group>
);

export default function ReaderSettingsSheet({ typography, theme = 'dark', onChangeTypography, onClose }) {
    const set = (changes) => onChangeTypography({ ...typography, ...changes });
    const activePreset = matchingPreset(typography);

    /** Cuántos ajustes de composición están fuera de su valor de fábrica. */
    const compositionChanges = [
        typography.paragraphStyle === 'indent',
        typography.justify,
        Boolean(typography.dropCap),
        Boolean(typography.hangingPunctuation),
    ].filter(Boolean).length;

    const pages = {
        composition: {
            title: 'Composición',
            render: () => (
                <>
                    {/* Sangría o espacio, nunca los dos: mezclarlos es el error
                        de composición más común. Un libro en papel sangra y pega
                        los párrafos; el espacio es convención de web. */}
                    <Segmented
                        label="Párrafos"
                        value={typography.paragraphStyle || 'space'}
                        options={[
                            { value: 'space', label: 'Separados' },
                            { value: 'indent', label: 'Con sangría' },
                        ]}
                        onChange={(paragraphStyle) => set({ paragraphStyle })}
                        hint="Con sangría, los párrafos van pegados y se sangra la primera
                              línea, que es como está compuesto cualquier libro en papel."
                    />

                    {typography.paragraphStyle !== 'indent' && (
                        <Segmented
                            label="Separación entre párrafos"
                            value={typography.paragraphSpacing}
                            options={[
                                { value: 0.3, label: 'Poca' },
                                { value: 0.7, label: 'Normal' },
                                { value: 1.2, label: 'Mucha' },
                            ]}
                            onChange={(paragraphSpacing) => set({ paragraphSpacing })}
                        />
                    )}

                    <Segmented
                        label="Interlineado"
                        value={typography.lineHeight}
                        options={[
                            { value: 1.35, label: 'Justo' },
                            { value: 1.6, label: 'Normal' },
                            { value: 1.9, label: 'Amplio' },
                            { value: 2.2, label: 'Máximo' },
                        ]}
                        onChange={(lineHeight) => set({ lineHeight })}
                    />

                    <Segmented
                        label="Márgenes"
                        value={typography.margin}
                        options={[
                            { value: 0, label: 'Sin' },
                            { value: 12, label: 'Poco' },
                            { value: 20, label: 'Normal' },
                            { value: 36, label: 'Amplio' },
                        ]}
                        onChange={(margin) => set({ margin })}
                    />

                    <div className="rows">
                        <Switch
                            label="Justificar"
                            hint="Alinea los dos bordes del texto"
                            checked={typography.justify}
                            onChange={(justify) => set({ justify })}
                        />

                        {/* La capitular se desactiva con el modo dislexia: una
                            letra de tres líneas es el tipo de obstáculo que ese
                            modo intenta quitar del camino. */}
                        {!typography.dyslexia && (
                            <Switch
                                label="Letra capitular"
                                hint="Inicial grande al empezar cada capítulo"
                                checked={Boolean(typography.dropCap)}
                                onChange={(dropCap) => set({ dropCap })}
                            />
                        )}

                        <Switch
                            label="Colgar comillas y rayas"
                            hint="Deja recto el margen izquierdo en los diálogos"
                            checked={Boolean(typography.hangingPunctuation)}
                            onChange={(hangingPunctuation) => set({ hangingPunctuation })}
                        />
                    </div>
                </>
            ),
        },

        accessibility: {
            title: 'Accesibilidad',
            render: () => (
                <>
                    <Switch
                        label="Modo dislexia"
                        hint="Atkinson Hyperlegible, más aire entre letras y palabras, sin justificar"
                        checked={typography.dyslexia}
                        onChange={(dyslexia) => set({ dyslexia })}
                    />

                    <Switch
                        label="Partir palabras"
                        hint="Evita huecos grandes al justificar"
                        checked={typography.hyphens}
                        onChange={(hyphens) => set({ hyphens })}
                    />

                    {/* La partición necesita saber el idioma. Muchos EPUB no lo
                        declaran o lo declaran mal, y entonces el justificado
                        sale con ríos blancos por mucho que se active. */}
                    {typography.hyphens && (
                        <Segmented
                            label="Idioma para partir"
                            value={typography.hyphenLang || 'auto'}
                            options={[
                                { value: 'auto', label: 'Del libro' },
                                { value: 'es', label: 'Español' },
                                { value: 'en', label: 'Inglés' },
                            ]}
                            onChange={(hyphenLang) => set({ hyphenLang })}
                            hint="«Del libro» usa el que declare el EPUB, que muchos declaran mal."
                        />
                    )}
                </>
            ),
        },
    };

    return (
        <Sheet title="Texto" onClose={onClose} pages={pages}>
            {({ openPage }) => (
                <>
                    {/* Lo primero que se ve es el texto, no los controles. */}
                    <TypePreview typography={typography} theme={theme} />

                    <Group label="Ajustes rápidos">
                        <div className="pills">
                            {Object.entries(TYPOGRAPHY_PRESETS).map(([id, preset]) => (
                                <button
                                    key={id}
                                    type="button"
                                    className={`pill${activePreset === id ? ' on' : ''}`}
                                    onClick={() => onChangeTypography(applyPreset(typography, id))}
                                    aria-pressed={activePreset === id}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    </Group>

                    <Group label="Fuente">
                        <div className="font-list">
                            {FONT_FAMILIES.map((font) => (
                                <button
                                    key={font.id}
                                    type="button"
                                    className={`font-btn${typography.fontFamily === font.id ? ' on' : ''}`}
                                    style={{ fontFamily: font.stack }}
                                    onClick={() => set({ fontFamily: font.id })}
                                    aria-pressed={typography.fontFamily === font.id}
                                >
                                    {font.label}
                                    {/* Las tres primeras viajan en el APK: se ven
                                        igual en cualquier móvil. Las demás
                                        dependen de lo que traiga el sistema. */}
                                    {font.bundled && <i className="font-badge" aria-label="incluida" />}
                                </button>
                            ))}
                        </div>
                    </Group>

                    <Stepper
                        label="Tamaño"
                        value={typography.fontSize}
                        unit=" px"
                        min={FONT_SIZE_MIN}
                        max={FONT_SIZE_MAX}
                        step={1}
                        onChange={(value) => set({ fontSize: clampFontSize(value) })}
                    />

                    <div className="rows">
                        <Row
                            label="Composición"
                            hint="Párrafos, interlineado, márgenes, capitular"
                            value={compositionChanges > 0 ? `${compositionChanges} cambiados` : null}
                            onClick={() => openPage('composition')}
                        />
                        <Row
                            label="Accesibilidad"
                            hint="Modo dislexia, partición de palabras"
                            value={typography.dyslexia ? 'Dislexia' : null}
                            onClick={() => openPage('accessibility')}
                        />
                    </div>
                </>
            )}
        </Sheet>
    );
}
