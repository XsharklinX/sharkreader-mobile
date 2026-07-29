import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { installPorts } from './ports/index.js';
import { createAndroidPorts } from './adapters/android.js';
import './styles/app.css';

// Los puertos se instalan antes de montar React: ninguna pantalla debe poder
// ejecutarse contra un registro vacío.
installPorts(createAndroidPorts());

document.documentElement.classList.add('theme-dark');

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
