import { describe, it, expect } from 'vitest';
import { hangingClassFor } from './EpubEngine.js';
import { buildReaderStyles } from './typography.js';

describe('hangingClassFor', () => {
    it('reconoce la raya de diálogo', () => {
        expect(hangingClassFor('—No pienso ir —dijo.')).toBe('sr-hang-dash');
    });

    it('reconoce las comillas latinas, inglesas y rectas', () => {
        expect(hangingClassFor('«Una cita»')).toBe('sr-hang-quote');
        expect(hangingClassFor('“Una cita”')).toBe('sr-hang-quote');
        expect(hangingClassFor('"Una cita"')).toBe('sr-hang-quote');
        expect(hangingClassFor("'Una cita'")).toBe('sr-hang-quote');
    });

    it('distingue raya de comilla: no ocupan lo mismo', () => {
        // Colgarlas por igual dejaría el margen torcido en el otro sentido,
        // que es peor porque además parece intencionado.
        expect(hangingClassFor('—x')).not.toBe(hangingClassFor('«x'));
    });

    it('ignora el espacio en blanco que arrastra el HTML del libro', () => {
        expect(hangingClassFor('\n      —Vamos.')).toBe('sr-hang-dash');
    });

    it('no marca un párrafo normal', () => {
        expect(hangingClassFor('Aquel día llovía.')).toBeNull();
    });

    it('no se rompe con un párrafo vacío', () => {
        expect(hangingClassFor('')).toBeNull();
        expect(hangingClassFor('   ')).toBeNull();
        expect(hangingClassFor(undefined)).toBeNull();
    });
});

describe('estilos de puntuación colgada', () => {
    it('no aparecen si la opción está apagada', () => {
        const styles = buildReaderStyles({ hangingPunctuation: false }, 'dark');
        expect(styles['.sr-hang-dash']).toBeUndefined();
    });

    it('saca el signo fuera de la caja de texto', () => {
        // Sin sangría, el valor es negativo a secas. Con sangría los dos se suman
        // en el mismo `text-indent` — lo comprueba la prueba de abajo.
        const styles = buildReaderStyles({ hangingPunctuation: true, paragraphStyle: 'space' }, 'dark');
        expect(styles['.sr-hang-dash']['text-indent']).toBe('-0.62em !important');
        expect(styles['.sr-hang-quote']['text-indent']).toBe('-0.34em !important');
    });

    it('se suma a la sangría de primera línea en vez de borrarla', () => {
        // La clase gana en especificidad: con el valor negativo a secas, un
        // diálogo aparecería sacado de la caja mientras el resto van sangrados.
        const styles = buildReaderStyles(
            { hangingPunctuation: true, paragraphStyle: 'indent' },
            'dark'
        );
        expect(styles['.sr-hang-dash']['text-indent']).toBe('0.7799999999999999em !important');
        expect(styles['p']['text-indent']).toBe('1.4em !important');
    });
});

describe('modo tinta electrónica', () => {
    it('engorda el trazo, que en e-ink se pierde', () => {
        const styles = buildReaderStyles({ eink: true }, 'eink');
        expect(styles.body['font-weight']).toBe('500 !important');
    });

    it('en una pantalla normal manda la preferencia', () => {
        // El peso pasó a ser ajustable: en una pantalla a pleno brillo un trazo
        // de 400 se lava, y de noche un 500 empasta. Las tres fuentes
        // empaquetadas son variables de 400 a 700, así que es peso real y no una
        // negrita sintética.
        expect(buildReaderStyles({ eink: false }, 'paper').body['font-weight']).toBe('400 !important');
        expect(buildReaderStyles({ eink: false, fontWeight: 500 }, 'paper').body['font-weight']).toBe('500 !important');
    });

    it('en tinta electrónica manda el panel, no la preferencia', () => {
        // Ahí el trazo fino no es cuestión de gusto: la tinta se expande al
        // asentarse y un peso ligero sale lavado.
        const styles = buildReaderStyles({ eink: true, fontWeight: 400 }, 'eink');
        expect(styles.body['font-weight']).toBe('500 !important');
    });

    it('el tema e-ink es negro puro sobre blanco puro', () => {
        const styles = buildReaderStyles({}, 'eink');
        expect(styles.body.color).toBe('#000000 !important');
        expect(styles.html.background).toBe('#FFFFFF !important');
    });
});
