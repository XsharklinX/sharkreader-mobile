"""Portada de Don Quijote para la biblioteca de demostración, al estilo de
Standard Ebooks: grabado de Doré (dominio público) con una banda oscura y el
título. Sustituye la portada genérica de Gutenberg dentro del EPUB."""
import io
import re
import shutil
import sys
import zipfile
from PIL import Image, ImageDraw, ImageFont, ImageOps

grabado, epub = sys.argv[1], sys.argv[2]
W, H = 1400, 2100
im = Image.open(grabado).convert('RGB')
# Sin el pie impreso del grabado.
im = im.crop((0, 0, im.width, int(im.height * 0.94)))
im = ImageOps.fit(im, (W, H), method=Image.LANCZOS, centering=(0.5, 0.35))
# Tono sepia suave: el grabado es en blanco y negro.
gris = ImageOps.grayscale(im)
im = ImageOps.colorize(gris, black=(28, 22, 16), white=(236, 226, 205))

d = ImageDraw.Draw(im, 'RGBA')
banda_y = int(H * 0.79)
d.rectangle([0, banda_y, W, banda_y + 300], fill=(18, 16, 14, 225))


def fuente(tam, negrita=True):
    for nombre in (['seguisb.ttf', 'segoeuib.ttf', 'arialbd.ttf'] if negrita else ['segoeui.ttf', 'arial.ttf']):
        try:
            return ImageFont.truetype('C:/Windows/Fonts/' + nombre, tam)
        except OSError:
            pass
    return ImageFont.load_default()


def centrado(texto, y, f, color, espaciado=0):
    ancho = d.textlength(texto, font=f) + espaciado * (len(texto) - 1)
    x = (W - ancho) / 2
    for letra in texto:
        d.text((x, y), letra, font=f, fill=color)
        x += d.textlength(letra, font=f) + espaciado


centrado('DON QUIJOTE', banda_y + 70, fuente(120), (245, 240, 230), 8)
centrado('MIGUEL DE CERVANTES', banda_y + 210, fuente(46), (220, 210, 190), 6)

salida = io.BytesIO()
im.save(salida, 'PNG', optimize=True)
nueva = salida.getvalue()

origen = zipfile.ZipFile(epub)
portada = [n for n in origen.namelist() if re.search(r'cover\.png$', n)][0]
tmp = epub + '.tmp'
with zipfile.ZipFile(tmp, 'w') as dest:
    for item in origen.infolist():
        datos = nueva if item.filename == portada else origen.read(item.filename)
        tipo = zipfile.ZIP_STORED if item.filename == 'mimetype' else zipfile.ZIP_DEFLATED
        dest.writestr(item, datos, compress_type=tipo)
origen.close()
shutil.move(tmp, epub)
im.resize((300, 450)).save(sys.argv[3])
print('portada sustituida:', portada)
