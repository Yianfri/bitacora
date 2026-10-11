# Datos y privacidad

El código puede compartirse sin publicar información del usuario. La demo usa
pueblos genéricos, fechas ficticias y ningún vuelo, contacto o coordenada real.
No añadir un plan personal a código, pruebas, capturas, README ni ejemplos.

| Información | Ubicación actual | ¿Se envía a un servidor? |
| --- | --- | --- |
| Código, documentación técnica y demo ficticia | Git y compilación | A GitHub al subir código. |
| Fuentes y planificación privada de una instalación | Archivos locales excluidos | No por el proyecto. |
| Viaje importado, jornadas y notas | IndexedDB del navegador | No; no existe API de sincronización. |
| Borrador de una nota | localStorage del navegador | No. |
| Respaldo exportado | Descarga elegida por el usuario | No por el proyecto. |

Un archivo propio se selecciona en **Traer un respaldo** o **Restaurar respaldo**.
Se lee con File.text, se valida y se revisa antes de guardar. La selección del
archivo no hace upload. Puede contener datos originales y notas, por lo que se
debe guardar en privado. La pantalla puede revelar información si se comparte
una captura o se usa un dispositivo ajeno.

Los datos dependen del perfil y origen del navegador. Cambiar dominio o puerto
crea otra ubicación local; exportar/restaurar permite trasladarlos. Borrar datos
del navegador puede borrar el diario. No hay cifrado específico de los archivos
ni del almacenamiento de la aplicación; conservar respaldo y dispositivo seguros.

Las carpetas locales privadas se excluyen de Git y del contexto Docker.
`check:publication` aplica una lista de rutas permitidas, busca indicadores
conocidos de información personal/credenciales y compara la semilla compilada
con la demo. Es una ayuda, no una garantía contra cualquier dato sensible.
Revisar también cambios e historial antes de publicar.

Antes de añadir una API se diseñarán autenticación, autorización por usuario,
respaldo, sincronización y conflictos. Publicar el código no habilita un servidor
público ni sube el diario del navegador.
