import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * La foto de la página que se dobla.
 *
 * Lo que importa aquí no es que haga la foto —eso lo hace Android— sino las tres
 * reglas de alrededor, que son las que, mal puestas, enseñan la página
 * equivocada: se guarda, caduca, y se puede tirar.
 */

const capture = vi.fn();
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ capture }) }));

const { createPageCapture } = await import('./PageCapture.js');

beforeEach(() => {
    capture.mockReset();
    vi.useFakeTimers();
});

afterEach(() => { vi.useRealTimers(); });

const FOTO = { image: 'data:image/jpeg;base64,AAA', width: 720, height: 1640 };

describe('la foto se guarda', () => {
    it('guarda la última y la devuelve sin volver a pedirla', async () => {
        capture.mockResolvedValue(FOTO);
        const cap = createPageCapture();

        const tomada = await cap.take();
        expect(tomada.image).toBe(FOTO.image);
        expect(cap.last().image).toBe(FOTO.image);

        // Pedirla otra vez no llama a Android: durante el gesto no hay tiempo.
        expect(capture).toHaveBeenCalledTimes(1);
    });

    it('sin foto todavía, no hay nada guardado', () => {
        expect(createPageCapture().last()).toBeNull();
    });
});

describe('la foto caduca', () => {
    it('a los treinta segundos deja de valer', async () => {
        capture.mockResolvedValue(FOTO);
        const cap = createPageCapture();
        await cap.take();

        vi.advanceTimersByTime(29_000);
        expect(cap.last()).toBeTruthy();

        // Pasado ese tiempo la pantalla ha podido cambiar de mil maneras —tema,
        // tamaño de letra, la barra del sistema— y doblar una hoja con la foto de
        // otra no se lee como un fallo: se lee como que la app perdió la página.
        vi.advanceTimersByTime(2_000);
        expect(cap.last()).toBeNull();
    });

    it('se puede tirar a mano al cambiar de página', async () => {
        capture.mockResolvedValue(FOTO);
        const cap = createPageCapture();
        await cap.take();

        cap.clear();
        expect(cap.last()).toBeNull();
    });
});

describe('cuando no hay plugin', () => {
    it('un fallo devuelve null y no revienta', async () => {
        // En el navegador, durante el desarrollo, el plugin no existe. El pliegue
        // tiene que seguir funcionando con las copias de HTML, no desaparecer.
        capture.mockRejectedValue(new Error('sin plugin'));
        const cap = createPageCapture();

        await expect(cap.take()).resolves.toBeNull();
        expect(cap.last()).toBeNull();
    });

    it('una respuesta sin imagen tampoco se guarda', async () => {
        capture.mockResolvedValue({ width: 720, height: 1640 });
        const cap = createPageCapture();

        expect(await cap.take()).toBeNull();
        expect(cap.last()).toBeNull();
    });

    it('una foto fallida borra la anterior', async () => {
        // Si no, al fallar una captura el pliegue seguiría usando la foto de la
        // página de antes: la hoja enseñaría un texto que ya no está en pantalla.
        capture.mockResolvedValueOnce(FOTO);
        const cap = createPageCapture();
        await cap.take();

        capture.mockRejectedValueOnce(new Error('falló'));
        await cap.take();

        expect(cap.last()).toBeNull();
    });
});
