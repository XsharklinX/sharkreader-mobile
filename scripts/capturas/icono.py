"""Icono de 512×512 para Google Play.

El logo solo existe en mapa de bits, y la copia más grande es la de 256 px del
.ico del escritorio. Se amplía al doble con Lanczos y un enfoque suave: sale
algo más blando que un original a 512, pero sin dientes ni halos. Si algún día
hay un original más grande (o vectorial), basta con pasarlo como argumento.

    python scripts/capturas/icono.py [origen]

Google Play pide PNG de 32 bits, 512×512, cuadrado y sin esquinas
redondeadas: la tienda pone ella la máscara.
"""
import os
import sys
from PIL import Image, ImageFilter

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
ORIGEN = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, '..', 'SharkReader-main', 'icon_build.ico')
SALIDA = os.path.join(RAIZ, 'playstore', 'icono-512.png')

im = Image.open(ORIGEN)
if getattr(im, 'ico', None):
    # El .ico guarda varios tamaños: el mayor.
    tam = max(im.ico.sizes())
    im = im.ico.getimage(tam)
im = im.convert('RGBA')

lado = min(im.size)
im = im.crop(((im.width - lado) // 2, (im.height - lado) // 2, (im.width + lado) // 2, (im.height + lado) // 2))

# El fondo del logo llega a los bordes: se rellena cualquier transparencia con
# el color de la esquina para que la tienda no muestre un marco.
fondo = Image.new('RGBA', im.size, im.getpixel((2, 2))[:3] + (255,))
fondo.alpha_composite(im)

# Margen de seguridad: Google Play enseña el icono a veces redondo, y las
# puntas de la aleta y la cola llegan al borde. Se recorta solo el tiburón (es
# claro sobre un fondo oscuro: basta el brillo) y se pone al 84 % sobre el
# mismo fondo rehecho como degradado suave, sin el corte de un cuadrado.
ESCALA = 0.84
gris = fondo.convert('L')

# Fondo: una rejilla de 5×5 muestras del original —cada una, la mediana de los
# píxeles oscuros de su zona, que son fondo y no tiburón— ampliada con
# suavizado. Sale un degradado con la misma luz que el logo.
muestras = Image.new('RGB', (5, 5))
celda = lado / 5
for fy in range(5):
    for fx in range(5):
        caja = (int(fx * celda), int(fy * celda), int((fx + 1) * celda), int((fy + 1) * celda))
        zona = fondo.crop(caja).convert('RGB')
        oscuros = sorted((p for p in zona.getdata() if sum(p) < 200), key=sum)
        if not oscuros:
            oscuros = sorted(zona.getdata(), key=sum)[:50]
        muestras.putpixel((fx, fy), oscuros[len(oscuros) // 2])
grande = muestras.resize((512, 512), Image.BICUBIC).filter(ImageFilter.GaussianBlur(30)).convert('RGBA')

# Tiburón: opaco donde es claro, transparente donde es fondo, con transición.
mascara = gris.point(lambda v: max(0, min(255, round((v - 100) * 6.4))))
# El .ico trae una fila clara en el borde que pasaría por tiburón.
for (x0, y0, x1, y1) in ((0, 0, lado, 4), (0, lado - 4, lado, lado), (0, 0, 4, lado), (lado - 4, 0, lado, lado)):
    mascara.paste(0, (x0, y0, x1, y1))
lado_logo = round(512 * ESCALA)
logo = fondo.resize((lado_logo, lado_logo), Image.LANCZOS)
logo = logo.filter(ImageFilter.UnsharpMask(radius=1.4, percent=55, threshold=2))
mascara = mascara.resize((lado_logo, lado_logo), Image.LANCZOS)
desde = (512 - lado_logo) // 2
grande.paste(logo, (desde, desde), mascara)
os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
grande.save(SALIDA, 'PNG', optimize=True)
print('icono:', SALIDA, grande.size, f'{os.path.getsize(SALIDA) // 1024} KB, desde {lado}px')
