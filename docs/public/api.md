# Contrato de la API: primera entrega

ASP.NET Core .NET 10, EF Core 10 y SQLite. Mi copia integra sesión y acciones
explícitas de guardar/recuperar. Copias privadas completas por usuario, sin sincronización automática.
El formato de respaldo v1 y los identificadores existentes se conservan.

Endpoints en Features/Authentication y Features/Trips. DTO HTTP en Dtos dentro de
cada función; entidades persistidas en Persistence/Entities. El cuerpo del respaldo
es JsonElement validado para conservar campos desconocidos. Esquema versionado en
Persistence/Migrations y __EFMigrationsHistory; ver [migraciones](migraciones.md).

## Sesión

No hay registro público. Crear cuentas mediante el comando administrativo local
`create-user`, con contraseña leída sin mostrarla y almacenada mediante
PasswordHasher de ASP.NET Core. Sesión de ocho horas, cookie HttpOnly y SameSite
Strict; Secure obligatorio fuera de Development. Sesiones revocables en SQLite
y claves de Data Protection persistentes en el directorio privado.

| Método y ruta | Comportamiento |
| --- | --- |
| GET /health | Salud del proceso y acceso a SQLite, sin datos personales. |
| GET /api/auth/csrf | Cookie antiforgery y JSON `{ "token": "…" }`. |
| POST /api/auth/login | JSON `username` y `password`; 200 con nombre de usuario, 401 genérico si falla. |
| GET /api/auth/me | Usuario autenticado; 401 sin sesión válida. |
| POST /api/auth/logout | Revoca la sesión actual y elimina cookie; 204. |

Enviar `X-CSRF-TOKEN` en todos los POST y PUT, incluido login. Obtener un nuevo
token después de iniciar sesión: el token está vinculado a la identidad.
Falta de token o token incorrecto devuelve 403. Login limitado a diez intentos
por minuto por dirección remota; 429 al superar el límite. No habilitar CORS
abierto. La integración usa el mismo origen mediante proxy.

## Copias de viajes

| Método y ruta | Comportamiento |
| --- | --- |
| GET /api/trips | Metadatos de las copias del usuario actual. |
| GET /api/trips/{id} | Respaldo v1 conservado, ETag de revisión; 404 si no pertenece al usuario. |
| PUT /api/trips/{id} | Valida y guarda el respaldo completo en una transacción. |

El cuerpo de PUT es el respaldo existente, sin un envoltorio nuevo. Para crear,
enviar `If-None-Match: *`; para actualizar, `If-Match` con el ETag leído antes,
por ejemplo `"1"`. Ambos casos necesitan sesión y token CSRF. La respuesta incluye
ID, revisión y momento de guardado remoto, además del nuevo ETag.

La integración del navegador envía `X-Routale-Account` con el nombre canónico
de la cuenta esperada en las peticiones de copias. Es una precondición adicional:
si la sesión compartida entre pestañas cambió de cuenta, se responde 409 con
`code: workspace_account_mismatch` sin leer ni modificar sus copias. La cabecera
no autentica al usuario ni sustituye la autorización por propietario. Es opcional
para clientes existentes; el frontend la incluye siempre.

Sin condición: 428. Condiciones incompatibles: 400. Copia existente al crear o
revisión obsoleta al actualizar: 412; el contenido existente se conserva. La
comparación y escritura ocurren dentro de una transacción SQLite. Una copia ajena
no se puede leer ni modificar; el mismo ID puede existir para distintos usuarios.

Validar forma, versión, fechas, enteros CLP, null, IDs, vínculos, procedencia y
hashes SHA-256 antes de escribir. Conservar campos desconocidos y textos de
origen. ID del viaje apto para ruta: letras ASCII, números, guion, punto, dos
puntos y guion bajo, hasta 200 caracteres. Máximo de cuerpo: 5 MiB y profundidad
JSON 64. Datos inválidos: 400; cuerpo excesivo: 413. Contención de SQLite: 503
con Retry-After; no confirmar un guardado fallido. Respuestas de datos y sesión
usan Cache-Control: no-store.

Cada cuenta puede conservar por defecto 100 copias y 100 MiB de JSON UTF-8 en
total. `Storage__MaxTripsPerUser` y `Storage__MaxBackupBytesPerUser` permiten
configurar valores positivos; una configuración inválida impide el arranque.
La cuota se comprueba después de la revisión y dentro de la misma transacción
que la escritura, incluyendo actualizaciones que aumenten el tamaño. Exceso:
409 Problem Details con `code: storage_quota_exceeded`; no cambia contenido,
revisión ni fecha. Actualizar una copia no consume otra plaza. La cuota es por
propietario; no sustituye un límite de volumen del servidor. Reducir cuotas no
borra copias existentes: se pueden leer, pero el resultado de un guardado debe
caber en la cuota de bytes; nuevas copias requieren también una plaza libre.

## Límites de esta entrega

La copia del servidor es independiente de IndexedDB. Nada del navegador se
envía hasta elegir el guardado remoto explícito. Sin borrado,
recuperación de contraseña, registro público, edición remota por entidad ni
fusión automática. No sustituir datos locales al recuperar sin revisión.

La base, sesiones y claves son privadas y quedan fuera de Git, Docker y CI.
Las pruebas usan solo la demo ficticia. No registrar cuerpos, contraseñas,
cookies ni información de viajes. HTTPS, cuentas reales y servidor Linux se
configurarán antes del despliegue real.

Referencias: [cookies de ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/cookie?view=aspnetcore-10.0),
[antiforgery](https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0)
y [transacciones SQLite](https://learn.microsoft.com/en-us/dotnet/standard/data/sqlite/transactions).
