import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './ui/ErrorBoundary.jsx';
import { installPorts } from './ports/index.js';
import { createAndroidPorts } from './adapters/android.js';
import './styles/app.css';
// La barra del lector vive en su propio fichero: `app.css` pasaba de las 1800
// líneas y el bloque del lector estaba repartido en tres sitios distintos.
import './styles/reader-chrome.css';
// Anatomía común de las hojas de opciones del lector.
import './styles/sheets.css';

// Los puertos se instalan antes de montar React: ninguna pantalla debe poder
// ejecutarse contra un registro vacío.
installPorts(createAndroidPorts());

document.documentElement.classList.add('theme-dark');

// Escala de fuente del sistema. Android la expone comparando el tamaño real de
// un elemento de 1rem con el que debería medir; el factor se limita para que un
// ajuste extremo no rompa la maquetación por completo.
const applySystemFontScale = () => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;font-size:1rem;height:1em';
    document.body.appendChild(probe);
    const scale = probe.getBoundingClientRect().height / 16;
    probe.remove();
    const clamped = Math.min(1.5, Math.max(0.85, scale || 1));
    document.documentElement.style.setProperty('--font-scale', String(clamped));
};
applySystemFontScale();

// Una promesa rechazada sin capturar no rompe el render, pero es la pista de un
// fallo real. En un WebView no hay consola a mano, así que al menos queda en el
// log de la app (visible con chrome://inspect o `adb logcat`).
window.addEventListener('unhandledrejection', (event) => {
    console.error('[SharkReader] promesa rechazada sin capturar:', event.reason);
});

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>
);
