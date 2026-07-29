# Servidor de voz neuronal

SharkReader puede leer en voz alta con voces neuronales, que suenan
notablemente mejor que la voz del sistema. Necesita un servidor tuyo.

## Por qué no viene uno puesto

Las voces neuronales las sirve un proveedor de nube y **todos cobran por
carácter sintetizado**. Hay dos formas de hacer esto y las dos tienen un
problema:

- **Llamar al proveedor desde la app.** Habría que meter la clave de API dentro
  del APK, y una clave dentro de un APK es una clave pública: se extrae en
  minutos y cualquiera puede gastar contra ella.
- **Poner un servidor de SharkReader.** Significaría pagar la síntesis de voz de
  todo el que instale la app. El día que se llenara o se apagara, la función
  dejaría de funcionar para todos a la vez y nadie podría arreglarlo.

Así que el servidor lo pones tú, con tu clave y tu factura. Son unas cuarenta
líneas.

## Lo que sale del dispositivo

El texto que se va a leer, y nada más: ni qué libro es, ni quién lo lee, ni por
dónde vas. Aun así es texto del libro saliendo del móvil, por eso la función
viene apagada y aparece en la pantalla de privacidad junto al resto de
conexiones.

La voz del sistema sigue siendo la de por defecto y no manda nada a ninguna
parte.

## El contrato

Un solo endpoint. Recibe JSON, devuelve audio:

```
POST /speak
Content-Type: application/json
Authorization: Bearer <token>        (opcional)

{ "text": "…", "voice": "es-ES-ElviraNeural", "rate": 1 }

→ 200 OK, Content-Type: audio/mpeg
```

La app espera **audio, no una URL**: comprueba el `Content-Type` y rechaza
cualquier cosa que no empiece por `audio/`.

## Servidor mínimo (Node + Azure)

```js
import express from 'express';

const app = express();
app.use(express.json({ limit: '64kb' }));

const KEY = process.env.AZURE_KEY;
const REGION = process.env.AZURE_REGION;
const TOKEN = process.env.SHARED_TOKEN;

app.post('/speak', async (req, res) => {
    // Sin esto, quien encuentre la dirección usa tu cuota.
    if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
        return res.status(401).end();
    }

    const { text, voice, rate = 1 } = req.body;
    if (!text || text.length > 1200) return res.status(400).end();

    // El porcentaje es lo que entiende SSML; 1 significa «sin cambio».
    const percent = Math.round((rate - 1) * 100);

    const ssml = `<speak version="1.0" xml:lang="es-ES">
        <voice name="${voice}">
            <prosody rate="${percent >= 0 ? '+' : ''}${percent}%">
                ${text.replace(/[<&]/g, ' ')}
            </prosody>
        </voice>
    </speak>`;

    const upstream = await fetch(
        `https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': KEY,
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
            },
            body: ssml,
        }
    );

    if (!upstream.ok) return res.status(502).end();

    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(await upstream.arrayBuffer()));
});

app.listen(process.env.PORT || 8080);
```

## Antes de dejarlo abierto

- **Pon el token.** Sin él, quien dé con la dirección sintetiza a tu costa.
- **Limita el ritmo de peticiones.** Un capítulo son decenas de llamadas
  seguidas; un bucle roto son miles.
- **Ponle HTTPS.** El texto viaja en claro y el token también.
- **Vigila el gasto.** Los proveedores dan alertas de cuota: actívalas antes de
  usarlo, no después de la primera factura.

## Coste orientativo

Azure cobra alrededor de 15 € por millón de caracteres de voz neuronal. Una
novela de 400 páginas ronda el millón de caracteres, así que **leerse un libro
entero cuesta unos 15 €**. Con la caché de la app, volver atrás unas páginas no
vuelve a cobrar, pero releer un capítulo días después sí.

Es un dato que conviene tener claro antes de activarlo: para escuchar libros
enteros a diario, la voz del sistema sale gratis y la neuronal no.
