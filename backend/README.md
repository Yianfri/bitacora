# Backend de Bitácora

ASP.NET Core .NET 10, EF Core 10.0.8 y SQLite. Cuentas administrativas,
sesiones revocables y copias privadas por propietario. SDK fijado en global.json.
Angular todavía no envía información a esta API.

## Recorrido del código

Los [endpoints de sesión](src/Bitacora.Api/Features/Authentication/AuthenticationEndpoints.cs)
y [endpoints de copias](src/Bitacora.Api/Features/Trips/TripEndpoints.cs) usan Minimal APIs.
Cada función tiene Dtos separados. Las entidades EF están en Persistence/Entities;
el contexto, adaptación del esquema anterior y migraciones están en Persistence.
Storage contiene operaciones de cuentas y viajes con LINQ.

Consultar [contrato HTTP](../docs/public/api.md),
[convenciones y comentarios](../docs/public/convenciones-codigo.md)
y [migraciones](../docs/public/migraciones.md).

## Verificar

Desde la raíz, con .NET SDK 10 y Node 24:

```sh
node frontend/tools/prepare-seed.mjs
dotnet tool restore
dotnet restore backend/Bitacora.slnx --locked-mode
dotnet format backend/Bitacora.slnx --verify-no-changes --no-restore
dotnet build backend/Bitacora.slnx --no-restore
dotnet ef migrations has-pending-model-changes --project backend/src/Bitacora.Api --no-build
dotnet test backend/Bitacora.slnx --no-build --no-restore
node --test --test-concurrency=1 backend/tests/api.test.mjs
```

xUnit comprueba dominio; las pruebas de persistencia usan SQLite real temporal,
incluida adopción de una base anterior con copias. Los recorridos HTTP cubren
autorización, CSRF, ETags, cuotas, Unicode, concurrencia, reinicio y logout.
Usan la demo ficticia y contraseñas aleatorias; eliminan solo sus carpetas temporales.
No se ejecutan sobre un directorio privado configurado por el usuario.

## Migrar, crear una cuenta y ejecutar

Definir Storage__Directory con una ruta privada de esta instalación.
En Development las pruebas pueden migrar al iniciar; en producción se exige
aplicar migraciones como paso previo independiente:

```powershell
dotnet run --project backend/src/Bitacora.Api --no-launch-profile -- migrate
dotnet run --project backend/src/Bitacora.Api --no-launch-profile -- create-user
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ASPNETCORE_URLS = 'http://127.0.0.1:5080'
dotnet run --project backend/src/Bitacora.Api --no-launch-profile
```

create-user pide contraseña sin mostrarla. No poner contraseñas en argumentos,
código o ejemplos. Development solo acepta loopback. Producción requiere HTTPS
y cookies Secure; el proxy confiable y el volumen se configurarán al revisar Linux.
Salud en /health; el frontend todavía no tiene pantalla de login.

Storage__Directory contiene bitacora.db y keys/ de Data Protection.
Por defecto se usa .data bajo el directorio de contenido. En Linux se crea privado;
en Windows revisar permisos. Base y claves no tienen cifrado específico en disco.
Permanecen fuera de Git, imágenes y CI. Respaldarlas con la API detenida.

Cuotas positivas: Storage__MaxTripsPerUser (100 por defecto) y
Storage__MaxBackupBytesPerUser (100 MiB de JSON UTF-8). Se comprueban en la
transacción junto con la revisión. Un rechazo 409 no modifica la copia.
El formato v1 conserva campos desconocidos y fuentes originales.

EF usa el proveedor SQLite Core con el bundle nativo SQLitePCLRaw actualizado.
Los lockfiles fijan dependencias; restauración con auditoría y warnings como errores.
No hay inscripción pública, recuperación de contraseña ni sincronización automática.
