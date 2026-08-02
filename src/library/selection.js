/**
 * Selección múltiple en la biblioteca.
 *
 * ## Por qué la lógica está fuera del componente
 *
 * Porque es la única parte de la biblioteca que **borra ficheros**. Un fallo aquí
 * no se ve raro en pantalla: se lleva libros. Y las decisiones que hay que acertar
 * —qué acción se ofrece cuando lo seleccionado es mixto, qué pasa al filtrar con
 * cosas ya marcadas— son de esas que se prueban en un segundo con datos inventados
 * y en veinte minutos a mano, con el riesgo de perder algo por el camino.
 */

/** Alterna un libro. Devuelve un conjunto nuevo: el estado no se muta. */
export const alternar = (seleccion, id) => {
    const siguiente = new Set(seleccion);
    if (siguiente.has(id)) siguiente.delete(id);
    else siguiente.add(id);
    return siguiente;
};

/**
 * Marca o desmarca todo lo que se está viendo.
 *
 * «Todo» es **lo visible**, no la biblioteca entera: con un filtro puesto,
 * seleccionar 136 libros cuando en pantalla hay 8 es la clase de sorpresa que
 * acaba en un borrado que nadie quería.
 */
export const alternarTodo = (seleccion, visibles) => {
    const ids = visibles.map((libro) => libro.id);
    const todosPuestos = ids.length > 0 && ids.every((id) => seleccion.has(id));

    if (todosPuestos) {
        const siguiente = new Set(seleccion);
        ids.forEach((id) => siguiente.delete(id));
        return siguiente;
    }

    return new Set([...seleccion, ...ids]);
};

/**
 * Quita de la selección lo que ya no está a la vista.
 *
 * Al cambiar de filtro o de búsqueda, lo seleccionado que desaparece de la
 * pantalla seguiría contando en «12 seleccionados» y se borraría con el resto sin
 * que nadie lo haya visto nunca. La selección no puede incluir lo que no se ve.
 */
export const podar = (seleccion, visibles) => {
    const vivos = new Set(visibles.map((libro) => libro.id));
    const siguiente = new Set();
    seleccion.forEach((id) => { if (vivos.has(id)) siguiente.add(id); });
    return siguiente;
};

/**
 * Qué ofrecen los botones para lo que hay marcado.
 *
 * Con una mezcla —unos terminados y otros no— la acción **completa**: marcar los
 * ocho como terminados es lo que se quiere el 99 % de las veces, y lo contrario
 * —desmarcar los tres que ya lo estaban— no lo pide nadie. Solo cuando están todos
 * en el mismo estado la acción lo invierte.
 */
export const accionesPara = (libros) => {
    const total = libros.length;
    const terminados = libros.filter((libro) => libro.isFinished).length;
    const favoritos = libros.filter((libro) => libro.isFav).length;

    return {
        total,
        terminar: {
            // Todos terminados → desmarcar. Ninguno o algunos → marcar.
            marcar: terminados < total,
            label: terminados === total && total > 0 ? 'Quitar terminado' : 'Marcar terminado',
        },
        favorito: {
            marcar: favoritos < total,
            label: favoritos === total && total > 0 ? 'Quitar de favoritos' : 'Añadir a favoritos',
        },
    };
};

/**
 * Los cambios que hay que guardar para una acción.
 *
 * Devuelve una lista de `{ id, cambios }` en vez de escribir: así se puede
 * comprobar qué se va a guardar sin tocar la base de datos, que es donde un fallo
 * cuesta caro.
 */
export const cambiosDe = (libros, accion) => {
    if (accion === 'terminar') {
        const marcar = accionesPara(libros).terminar.marcar;
        return libros.map((libro) => ({
            id: libro.id,
            cambios: {
                isFinished: marcar,
                dateFinished: marcar ? (libro.dateFinished || Date.now()) : null,
                // Al marcar terminado el progreso va al 100 %; al desmarcarlo se
                // deja como estaba, porque el usuario no ha dicho por dónde va.
                ...(marcar ? { progress: 1 } : {}),
            },
        }));
    }

    if (accion === 'favorito') {
        const marcar = accionesPara(libros).favorito.marcar;
        return libros.map((libro) => ({ id: libro.id, cambios: { isFav: marcar } }));
    }

    return [];
};
