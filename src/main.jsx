import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './ui/ErrorBoundary.jsx';
import { installPorts } from './ports/index.js';
import { createAndroidPorts } from './adapters/android.js';
import './styles/app.css';

// Los puertos se instalan antes de montar React: ninguna pantalla debe poder
// ejecutarse contra un registro vacío.
installPorts(createAndroidPorts());

document.documentElement.classList.add('theme-dark');

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
