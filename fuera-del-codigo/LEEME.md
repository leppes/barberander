# Fuera del código

Esta carpeta **NO se sube a GitHub Pages**. Son archivos de apoyo, no son parte de la página.

| Archivo | Para qué sirve |
|---|---|
| `base-de-datos/20261003000000_esquema_inicial.sql` | Receta de la base de datos: tablas, reglas de seguridad y funciones de reserva. |
| `base-de-datos/20261014000000_personalizacion.sql` | Segunda parte: contenido editable, fotos, interruptor de reservas y horario cada 1 hora. |
| `LEEME-fotos.md` | Qué fotos van en `img/` (ahora también se pueden subir desde el panel). |

**No borres los `.sql`**: con ellos se recrea todo en otro proyecto de Supabase (se aplican en orden).

## Qué SÍ se sube a GitHub

```
index.html          ← página principal
reservar.html       ← reservar hora
reserva.html        ← ver / cancelar reserva
admin.html          ← panel de Anderson
css/styles.css      ← diseño
js/boot.js          ← aplica los colores antes de mostrar la página
js/config.js        ← conexión a Supabase y contenido de respaldo
js/utils.js         ← herramientas (fechas, precios, WhatsApp)
js/site.js          ← lee textos, fotos y colores desde Supabase
js/main.js          ← página principal
js/reservar.js      ← reservar hora
js/reserva.js       ← ver / cancelar reserva
js/admin.js         ← panel: sesión, agenda, bloqueos
js/admin-ajustes.js ← panel: horario, reglas, servicios, cuenta
js/admin-pagina.js  ← panel: editor de la página y del diseño
img/                ← fotos
```
