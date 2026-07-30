import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El WebView de Android sirve la app desde https://localhost (scheme de Capacitor),
// así que el CSP es más estricto que en escritorio: no hay ficheros locales que cargar.
const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    // `blob:` hace falta para rasterizar la página (el doblado de hoja).
    //
    // El rasterizador clona el documento del libro en un iframe aislado y le pasa
    // las hojas de estilo como blobs generados por nosotros mismos. Sin esto el
    // clon salía sin estilos y la imagen del pliegue quedaba en blanco — se vio en
    // el registro del dispositivo: «Loading the stylesheet 'blob:…' violates the
    // following Content Security Policy directive».
    //
    // No abre nada al exterior: un `blob:` solo puede crearlo esta misma app, así
    // que el contenido de un EPUB no puede aprovecharlo para traer estilos de la
    // red. Lo que sigue prohibido —y es lo que importa— es que un libro ejecute
    // scripts: `script-src 'self'` no se toca.
    "style-src 'self' 'unsafe-inline' blob:",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob:",
    "connect-src 'self' data: blob: https:",
    "worker-src 'self' blob:",
    "frame-src 'self' blob: data:",
    "object-src 'none'",
    "base-uri 'self'",
].join('; ');

const cspPlugin = {
    name: 'inject-csp-production',
    apply: 'build',
    transformIndexHtml(html) {
        return html.replace(
            '<meta name="viewport"',
            `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n    <meta name="viewport"`
        );
    },
};

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.{js,jsx}'],
    },
    plugins: [react(), cspPlugin],
    // Capacitor copia dist/ dentro del APK y lo sirve desde la raíz del scheme.
    base: './',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        target: 'es2020',
        chunkSizeWarningLimit: 700,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('/react-dom/') || id.includes('/react/')) return 'react-vendor';
                    if (id.includes('pdfjs-dist')) return 'pdf-vendor';
                    if (id.includes('epubjs')) return 'epub-vendor';
                },
            },
        },
    },
    // epub.js espera algunos globals de Node
    define: {
        global: 'globalThis',
    },
    server: {
        host: true,
        port: 5173,
    },
    optimizeDeps: {
        include: ['react', 'react-dom'],
    },
});
