import React from 'react';
import { IconBook } from './icons.jsx';

/**
 * Red de seguridad para errores de render.
 *
 * Sin esto, cualquier excepción durante el render o dentro de un efecto hace que
 * React desmonte el árbol entero: la app aparece un instante y se queda en una
 * pantalla oscura, sin mensaje ni forma de saber qué ha pasado. En un WebView
 * empaquetado no hay consola a mano, así que el error tiene que mostrarse en la
 * propia pantalla.
 *
 * Muestra el mensaje real y ofrece copiarlo: es lo único que hace depurable un
 * fallo que solo ocurre en el móvil de otra persona.
 */
export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null, info: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        this.setState({ info });
        console.error('[SharkReader] error no controlado:', error, info?.componentStack);
    }

    handleCopy = async () => {
        const { error, info } = this.state;
        const report = [
            `SharkReader Mobile`,
            `Error: ${error?.message || error}`,
            '',
            error?.stack || '',
            '',
            info?.componentStack || '',
        ].join('\n');
        try {
            await navigator.clipboard.writeText(report);
        } catch {
            // Sin portapapeles disponible, el texto sigue visible en pantalla.
        }
    };

    render() {
        const { error, info } = this.state;
        if (!error) return this.props.children;

        return (
            <div className="crash">
                <span className="empty-art" aria-hidden="true"><IconBook size={30} /></span>
                <h1 className="empty-title">Algo se ha roto</h1>
                <p className="empty-body">
                    La app ha encontrado un error del que no puede recuperarse sola.
                    Tus libros y tu progreso están a salvo: nada de esto borra datos.
                </p>

                <pre className="crash-detail">{error?.message || String(error)}</pre>

                <div className="crash-actions">
                    <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
                        Reiniciar la app
                    </button>
                    <button type="button" className="btn" onClick={this.handleCopy}>
                        Copiar el detalle del error
                    </button>
                </div>

                {info?.componentStack && (
                    <details className="crash-stack">
                        <summary>Detalle técnico</summary>
                        <pre>{info.componentStack}</pre>
                    </details>
                )}
            </div>
        );
    }
}
