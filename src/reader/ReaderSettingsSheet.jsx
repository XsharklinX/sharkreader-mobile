import React from 'react';
import {
    FONT_FAMILIES,
    TYPOGRAPHY_PRESETS,
    READER_THEMES,
    applyPreset,
} from './typography.js';

const Slider = ({ label, value, min, max, step, unit, onChange }) => (
    <label className="setting">
        <span className="setting-label">
            {label}
            <span className="mono setting-value">{value}{unit}</span>
        </span>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
        />
    </label>
);

/**
 * Ajustes de lectura, en una hoja que sube desde abajo.
 *
 * Sube desde abajo y no baja desde arriba a propósito: los controles quedan al
 * alcance del pulgar en vez de obligar a recolocar la mano.
 */
export default function ReaderSettingsSheet({
    typography,
    theme,
    onChangeTypography,
    onChangeTheme,
    onClose,
}) {
    const set = (changes) => onChangeTypography({ ...typography, ...changes });

    return (
        <div className="sheet-backdrop" onClick={onClose} role="presentation">
            <section
                className="sheet"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Ajustes de lectura"
            >
                <div className="sheet-grip" aria-hidden="true" />

                <div className="setting-group">
                    <span className="setting-label">Presets</span>
                    <div className="pills">
                        {Object.entries(TYPOGRAPHY_PRESETS).map(([id, preset]) => (
                            <button
                                key={id}
                                type="button"
                                className="pill-btn"
                                onClick={() => onChangeTypography(applyPreset(typography, id))}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="setting-group">
                    <span className="setting-label">Tema</span>
                    <div className="pills">
                        {Object.entries(READER_THEMES).map(([id, option]) => (
                            <button
                                key={id}
                                type="button"
                                className={`pill-btn${theme === id ? ' on' : ''}`}
                                onClick={() => onChangeTheme(id)}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="setting-group">
                    <span className="setting-label">Fuente</span>
                    <div className="pills">
                        {FONT_FAMILIES.map((font) => (
                            <button
                                key={font.id}
                                type="button"
                                className={`pill-btn${typography.fontFamily === font.id ? ' on' : ''}`}
                                onClick={() => set({ fontFamily: font.id })}
                                style={{ fontFamily: font.stack }}
                            >
                                {font.label}
                            </button>
                        ))}
                    </div>
                </div>

                <Slider label="Tamaño"       value={typography.fontSize}        min={12} max={34} step={1}    unit=" px" onChange={(fontSize) => set({ fontSize })} />
                <Slider label="Interlineado" value={typography.lineHeight}      min={1.1} max={2.4} step={0.1} unit=""    onChange={(lineHeight) => set({ lineHeight })} />
                <Slider label="Márgenes"     value={typography.margin}          min={0}  max={48} step={2}    unit=" px" onChange={(margin) => set({ margin })} />
                <Slider label="Entre letras" value={typography.letterSpacing}   min={0}  max={2}  step={0.1}  unit=" px" onChange={(letterSpacing) => set({ letterSpacing })} />
                <Slider label="Entre párrafos" value={typography.paragraphSpacing} min={0} max={2} step={0.1} unit=" em" onChange={(paragraphSpacing) => set({ paragraphSpacing })} />

                <label className="setting setting-toggle">
                    <span className="setting-label">Justificar texto</span>
                    <input
                        type="checkbox"
                        checked={typography.justify}
                        onChange={(event) => set({ justify: event.target.checked })}
                    />
                </label>

                <label className="setting setting-toggle">
                    <span className="setting-label">Partir palabras</span>
                    <input
                        type="checkbox"
                        checked={typography.hyphens}
                        onChange={(event) => set({ hyphens: event.target.checked })}
                    />
                </label>

                <button type="button" className="btn btn-primary" onClick={onClose}>
                    Listo
                </button>
            </section>
        </div>
    );
}
