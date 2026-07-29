import React from 'react';
import PhasePlaceholder from '../ui/PhasePlaceholder.jsx';

export default function ProgressScreen() {
    return (
        <PhasePlaceholder
            title="Progreso"
            emoji="📊"
            version="v0.5.0"
            phase="Fase 5 — Progreso, logros y Sharky"
            items={[
                'Racha diaria con récord histórico',
                'Heatmap anual y gráfica por día, semana y mes',
                'Metas diaria, semanal y mensual',
                'Plan de lectura con fecha objetivo',
                'Resumen Anual en formato vertical',
            ]}
        />
    );
}
