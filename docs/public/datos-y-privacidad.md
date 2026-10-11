# Datos y privacidad

El código puede compartirse sin publicar información del usuario. La demo usa
pueblos genéricos, fechas ficticias y ningún vuelo, contacto o coordenada real.
No añadir un plan personal a código, pruebas, capturas, README ni ejemplos.

| Información | Ubicación actual | ¿Se envía a un servidor? |
| --- | --- | --- |
| Código, documentación técnica y demo ficticia | Git y compilación | A GitHub al subir código. |
| Fuentes y planificación privada de una instalación | Archivos locales excluidos | No por el proyecto. |
| Viaje importado, jornadas y notas | IndexedDB del navegador | No; Angular aún no consume la API. |
| Borrador de una nota | localStorage del navegador | No. |
| Respaldo exportado | Descarga elegida por el usuario | No por el proyecto. |
| Copias enviadas explícitamente a la API | SQLite privado | Solo mediante petición autenticada; aún no hay acción de envío en Angular. |
| Cuentas, hashes de contraseña, sesiones y claves de cookies | Directorio privado del backend | Permanecen en la instalación de la API, fuera de Git e imágenes. |

Un archivo propio se selecciona en **Traer un respaldo** o **Restaurar respaldo**.
Se lee con File.text, se valida y se revisa antes de guardar. La selección del
archivo no hace upload. Puede contener datos originales y notas, por lo que se
debe guardar en privado. La pantalla puede revelar información si se comparte
una captura o se usa un dispositivo ajeno.

La validación indexa los IDs de cada fuente una vez por operación, también al
guardar el diario; nunca conserva un índice global que pueda quedar obsoleto.
Las fuentes de un respaldo tienen un límite conjunto de 10 MiB UTF-8 y un millón
de valores JSON, con profundidad máxima de 64 niveles. Se rechazan explícitamente
sin truncar ni reemplazar datos. El formato v1, campos desconocidos, BOM, texto
original y hashes permanecen intactos para fuentes dentro de esos límites.

Los datos dependen del perfil y origen del navegador. Cambiar dominio o puerto
crea otra ubicación local; exportar/restaurar permite trasladarlos. Borrar datos
del navegador puede borrar el diario. No hay cifrado específico de los archivos
ni del almacenamiento de la aplicación; conservar respaldo y dispositivo seguros.

Las carpetas locales privadas se excluyen de Git y del contexto Docker.
Los recursos públicos se limitan a la demo, logo, icono y manifiesto; la preparación
rechaza archivos inesperados en public/ antes de compilar.
`check:publication` aplica una lista de rutas permitidas, busca indicadores
conocidos de información personal/credenciales y compara la semilla compilada
con la demo. Es una ayuda, no una garantía contra cualquier dato sensible.
Revisar también cambios e historial antes de publicar.

La API incluye autenticación, autorización por usuario, validación de respaldos
y revisión transaccional para evitar sobrescrituras. Su contrato se documenta
en [API](api.md). Publicar el código no habilita un servidor público ni sube el
diario del navegador. La integración y sincronización entre dispositivos siguen
pendientes; cualquier recuperación local debe revisarse antes de reemplazar.

Las cuotas por usuario también se comprueban dentro de la transacción para evitar
agotar el almacenamiento con copias simultáneas. La imagen Nginx conserva las
cabeceras de seguridad al servir HTML y recursos PWA, e impide enmarcar la página
mediante X-Frame-Options y CSP frame-ancestors. CI comprueba las respuestas reales.

SQLite y las claves persistentes de Data Protection no tienen cifrado específico
en disco. El directorio requiere permisos privados y un respaldo protegido. No
incorporar bases, claves, cookies o archivos enviados a imágenes ni artefactos CI.
