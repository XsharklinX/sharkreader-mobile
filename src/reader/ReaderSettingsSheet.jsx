import React from 'react';
import {
    FONT_FAMILIES, TYPOGRAPHY_PRESETS,
    applyPreset, matchingPreset, clampFontSize, clampMargin,
    FONT_SIZE_MIN, FONT_SIZE_MAX, MARGIN_MIN, MARGIN_MAX,
} from './typography.js';

/**
 * Ajustes de **texto**. Solo texto.
 *
 * El tema, el modo de paginación, la animación y el brillo viven en la hoja de
 * pantalla, detrás de su propio botón. Antes estaba todo aquí y obligaba a
 * recorrer una lista larga para cambiar algo tan habitual como el fondo.
 *
 * Los controles son pasos y segmentos, no deslizadores: acertar un valor exacto
 * arrastrando en móvil es incómodo, y lo que el usuario quiere expresar es «un
 * poco más grande», no «19 píxeles».
 */

const Stepper = ({ label, value, unit, min, max, step, onChange }) => (
    <div className="setting">
        <span className="setting-label">
            {label}
            <span className="setting-value">{value}{unit || ''}</span>
        </span>
        <div className="stepper">
            <button
                type="button"
                onClick={() => onChange(value - step)}
                disabled={value <= min}
                aria-label={`Reducir ${label.toLowerCase()}`}
            >
                <span style={{ fontSize: 17, fontWeight: 600 }}>−</span>
            </button>
            <span className="stepper-preview" style={{ fontSize: Math.min(22, Math.max(11, value)) }}>Aa</span>
            <button
                type="button"
                onClick={() => onChange(value + step)}
                disabled={value >= max}
                aria-label={`Aumentar ${label.toLowerCase()}`}
            >
                <span style={{ fontSize: 17, fontWeight: 600 }}>+</span>
            </button>
        </div>
    </div>
);

const Segmented = ({ label, value, options, onChange }) => (
    <div className="setting">
        <span className="setting-label">{label}</span>
        <div className="segmented" role="group" aria-label={label}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    className={value === option.value ? 'on' : ''}
                    onClick={() => onChange(option.value)}
                    aria-pressed={value === option.value}
                >
                    {option.label}
                </button>
            ))}
        </div>
    </div>
);

const Switch = ({ label, hint, checked, onChange }) => (
    <div className="setting setting-row">
        <span className="setting-label">
            <span>
                {label}
                {hint && <span className="option-desc" style={{ display: 'block' }}>{hint}</span>}
            </span>
        </span>
        <button
            type="button"
            className={`switch${checked ? ' on' : ''}`}
            onClick={() => onChange(!checked)}
            role="switch"
            aria-checked={!!checked}
            aria-label={label}
        />
    </div>
);

export default function ReaderSettingsSheet({ typography, onChangeTypography, onClose }) {
    const set = (changes) => onChangeTypography({ ...typography, ...changes });
    const activePreset = matchingPreset(typography);

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <section
                className="sheet"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Ajustes de texto"
            >
                <span className="grip" aria-hidden="true" />

                <div className="setting">
                    <span className="setting-label">Ajustes rápidos</span>
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
                </div>

                <div className="setting">
                    <span className="setting-label">Fuente</span>
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
                            </button>
                        ))}
                    </div>
                </div>

                <Stepper
                    label="Tamaño"
                    value={typography.fontSize}
                    unit=" px"
                    min={FONT_SIZE_MIN}
                    max={FONT_SIZE_MAX}
                    step={1}
                    onChange={(value) => set({ fontSize: clampFontSize(value) })}
                />

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
                    onChange={(margin) => set({ margin: clampMargin(margin) })}
                />

                <Segmented
                    label="Entre párrafos"
                    value={typography.paragraphSpacing}
                    options={[
                        { value: 0.3, label: 'Poco' },
                        { value: 0.7, label: 'Normal' },
                        { value: 1.2, label: 'Mucho' },
                    ]}
                    onChange={(paragraphSpacing) => set({ paragraphSpacing })}
                />

                <Switch
                    label="Justificar"
                    checked={typography.justify}
                    onChange={(justify) => set({ justify })}
                />

                <Switch
                    label="Partir palabras"
                    hint="Evita huecos grandes al justificar"
                    checked={typography.hyphens}
                    onChange={(hyphens) => set({ hyphens })}
                />

                <Switch
                    label="Modo dislexia"
                    hint="Más aire entre letras y palabras, sin justificar"
                    checked={typography.dyslexia}
                    onChange={(dyslexia) => set({ dyslexia })}
                />

                <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
                    Listo
                </button>
            </section>
        </div>
    );
}
