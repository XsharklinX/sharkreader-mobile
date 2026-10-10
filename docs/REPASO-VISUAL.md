# Repaso visual

Lista corta de cosas que hay que **mirar con los ojos** en el teléfono antes de
dar una tanda por terminada.

## Por qué existe

Hay 1.097 pruebas y no vieron los tres fallos de la última tanda:

- la barra del lector de PDF salía como una columna de iconos que llenaba media
  pantalla, porque `.reader-tools` no tenía ni una regla CSS;
- las hojas de ajustes tenían dos topes de alto distintos, en unidades distintas,
  y entre ellos una franja de contenido a la que no se llegaba;
- el plegado de página se quedaba congelado a pantalla completa cuando el
  recorte salía `NaN`, y había que salir del libro.

Los tres son de maquetación, y los tres pasaban todas las pruebas: el componente
se montaba, respondía a los toques y devolvía el árbol correcto. Lo que estaba
mal es que ese árbol no tenía aspecto.

Ahora hay dos redes más —`clasesUsadas.test.js`, que cazaría el primero, y una
prueba por pantalla, que caza que algo reviente al abrirse— pero **ninguna de las
dos ve un alto mal puesto ni un texto que se sale**. Eso solo se ve mirando.

Son ocho minutos. El fallo del PDF llevaba semanas.

## La lista

Con el teléfono en vertical y un libro real, no uno de prueba.

### Biblioteca

1. **Las tres vistas.** Rejilla, lista y estante. En cada una: las portadas se
   ven enteras, el título no se sale de su caja, y **tocar un libro lo abre**.
2. **Buscar.** Escribir algo que no exista: sale el vacío con su texto, no una
   rejilla en blanco.
3. **Importar una carpeta.** Los libros van apareciendo mientras se añaden, no
   un mensaje quieto y de golpe todos.

### Lector

4. **Pasar diez páginas seguidas** con el plegado puesto. Se ve el pliegue
   mientras el dedo está abajo, y en las diez páginas: no se congela, el texto no
   se funde con el de la página anterior, y la sombra del canto está donde toca.
5. **Página uno hacia atrás.** Rebota y vuelve; no se queda a medio camino ni
   pasa a una página en blanco.
6. **Un libro con ilustraciones.** El de los mitos. Pasar por encima de una
   lámina a doble página y seguir pasando después.
7. **Cambiar el cuerpo de letra de 18 a 22.** La frase por la que ibas sigue
   siendo la primera de la página.
8. **El gesto de brillo** en el borde izquierdo: baja, sube, y al soltar no pasa
   página.
9. **Las cuatro hojas** —Texto, Pantalla, Notas, Voz—: se llega al **último**
   control de cada una desplazando.

### PDF y cómic

10. **Abrir un PDF.** La barra de herramientas es una fila, no una columna. El
    zoom cambia y el deslizador mueve de página.
11. **Abrir un CBZ.** Ajuste al ancho y a la pantalla, y el sentido manga
    invirtiendo qué lado avanza.

### Lo demás

12. **Ajustes, las seis categorías.** Abrir cada una y volver.
13. **Progreso**, con la biblioteca recién instalada y sin un minuto leído: sale
    «Aún sin datos» y no una pantalla rota.
14. **Girar el teléfono** en cualquier pantalla: no gira nada.
15. **Quince minutos leyendo sin tocar.** La pantalla sigue encendida.

## Cómo se anota

Lo que falle se apunta con **qué pantalla, qué libro y qué se hizo**. Sin el
libro concreto no se reproduce: casi todo lo que se rompe en el lector se rompe
con un EPUB determinado y no con los demás.
