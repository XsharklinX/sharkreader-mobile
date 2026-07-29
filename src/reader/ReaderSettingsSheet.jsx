import React from 'react';
import {
    FONT_FAMILIES, TYPOGRAPHY_PRESETS, READER_THEMES,
    applyPreset, matchingPreset, clampFontSize, clampMargin,
    FONT_SIZE_MIN, FONT_SIZE_MAX, MARGIN_MIN, MARGIN_MAX,
} from './typography.js';

/**
 * Ajustes de lectura.
 *
 * Sube desde abajo para que los controles queden al alcance del pulgar, y usa
 * pasos y segmentos en lugar de deslizadores: acertar un valor exacto
 * arrastrando en móvil es incómodo, y lo que el usuario quiere expresar es «un
 * poco más grande», no «19 píxeles».
 *
 * Los temas se muestran con el color que aplican, no con su nombre: se elige un
 * fondo de lectura mirándolo, no leyendo una etiqueta.
 */

const Stepper = ({ label, value, unit, min, max, step, onChange, format }) => (
    <div className="setting">
        <span className="setting-label">{label}</span>
        <div className="stepper">
            <button
                type="button"
                onClick={() => onChange(value - step)}
                disabled={value <= min}
                aria-label={`Reducir ${label.toLowerCase()}`}
            >
                <span style={{ fontSize: 17, fontWeight: 600 }}>−</span>
            </button>
            <span className="stepper-val">{format ? format(value) : `${value}${unit || ''}`}</span>
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

export default function ReaderSettingsSheet({ typography, theme, onChangeTypography, onChangeTheme, onClose }) {
    const set = (changes) => onChangeTypography({ ...typography, ...changes });
    const activePreset = matchingPreset(typography);

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <section
                className="sheet"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Ajustes de lectura"
            >
                <span className="grip" aria-hidden="true" />

                <div className="setting">
                    <span className="setting-label">Tema</span>
                    <div className="themes">
                        {Object.entries(READER_THEMES).map(([id, option]) => (
                            <div className="theme-item" key={id}>
                                <button
                                    type="button"
                                    className={`theme-swatch${theme === id ? ' on' : ''}`}
                                    style={{ background: option.bg, color: option.text }}
                                    onClick={() => onChangeTheme(id)}
                                    aria-label={option.label}
                                    aria-pressed={theme === id}
                                >
                                    Aa
                                </button>
                                <span className="theme-name">{option.label}</span>
                            </div>
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
                    label="Tamaño del texto"
                    value={typography.fontSize}
                    unit=" px"
                    min={FONT_SIZE_MIN}
                    max={FONT_SIZE_MAX}
                    step={1}
                    onChange={(value) => set({ fontSize: clampFontSize(value) })}
                />

                <Stepper
                    label="Márgenes"
                    value={typography.margin}
                    unit=" px"
                    min={MARGIN_MIN}
                    max={MARGIN_MAX}
                    step={4}
                    onChange={(value) => set({ margin: clampMargin(value) })}
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
                    label="Separación entre párrafos"
                    value={typography.paragraphSpacing}
                    options={[
                        { value: 0.3, label: 'Poca' },
                        { value: 0.7, label: 'Media' },
                        { value: 1.2, label: 'Mucha' },
                    ]}
                    onChange={(paragraphSpacing) => set({ paragraphSpacing })}
                />

                <div className="setting setting-row">
                    <span className="setting-label">Justificar el texto</span>
                    <button
                        type="button"
                        className={`switch${typography.justify ? ' on' : ''}`}
                        onClick={() => set({ justify: !typography.justify })}
                        role="switch"
                        aria-checked={typography.justify}
                        aria-label="Justificar el texto"
                    />
                </div>

                <div className="setting setting-row">
                    <span className="setting-label">Partir palabras al final de línea</span>
                    <button
                        type="button"
                        className={`switch${typography.hyphens ? ' on' : ''}`}
                        onClick={() => set({ hyphens: !typography.hyphens })}
                        role="switch"
                        aria-checked={typography.hyphens}
                        aria-label="Partir palabras"
                    />
                </div>

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

                <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
                    Listo
                </button>
            </section>
        </div>
    );
}
