# Libros de muestra para las capturas

No se versionan: son de terceros (dominio público) y pesan unos 25 MB.
`scripts/capturas/main.jsx` espera estos nombres de fichero aquí.

| Fichero | Libro | Origen |
|---|---|---|
| `gutenberg-2000.epub` | Don Quijote | https://www.gutenberg.org/ebooks/2000.epub3.images |
| `gutenberg-17340.epub` | Marianela | https://www.gutenberg.org/ebooks/17340.epub3.images |
| `gutenberg-49836.epub` | Niebla | https://www.gutenberg.org/ebooks/49836.epub3.images |
| `jane-austen_pride-and-prejudice.epub` | Pride and Prejudice | Standard Ebooks |
| `herman-melville_moby-dick.epub` | Moby Dick | Standard Ebooks |
| `arthur-conan-doyle_the-adventures-of-sherlock-holmes.epub` | The Adventures of Sherlock Holmes | Standard Ebooks |
| `mary-shelley_frankenstein.epub` | Frankenstein | Standard Ebooks |
| `bram-stoker_dracula.epub` | Dracula | Standard Ebooks |
| `alice.epub` | Alice's Adventures in Wonderland (ilustraciones de Tenniel) | Standard Ebooks |
| `apuntes-imprenta.pdf` | Apuntes de muestra | Se genera imprimiendo `scripts/capturas/apuntes.html` |

Los de Standard Ebooks se bajan de
`https://standardebooks.org/ebooks/<autor>/<titulo>/downloads/<autor>_<titulo>.epub?source=download`.

La portada genérica de Gutenberg del Quijote se sustituye por un grabado de
Gustave Doré (dominio público, Wikimedia Commons) con
`scripts/capturas/portada_quijote.py <grabado.jpg> libros/gutenberg-2000.epub <vista.png>`.
