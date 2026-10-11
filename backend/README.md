# Backend de Bitácora

ASP.NET Core .NET 10 y SQLite. Cuentas locales, sesiones revocables y copias de
viajes privadas por propietario. [Contrato HTTP](../docs/public/api.md).
Angular todavía no envía información a esta API.

Desde la raíz del repositorio, con .NET SDK 10 y Node 24 instalados:

```powershell
dotnet restore backend/src/Bitacora.Api/Bitacora.Api.csproj --locked-mode
dotnet build backend/src/Bitacora.Api/Bitacora.Api.csproj --no-restore
node --test --test-concurrency=1 backend/tests/api.test.mjs
```

Las pruebas crean cuentas con contraseñas aleatorias y una base temporal, usan
únicamente la demo ficticia y eliminan esa base al terminar. Comprobar también
formato con `dotnet format backend/src/Bitacora.Api/Bitacora.Api.csproj --verify-no-changes --no-restore`.

## Cuenta y ejecución local

Crear una cuenta mediante el administrador local; la contraseña se pide sin
mostrarla. No incluirla en argumentos, código ni archivos de ejemplo:

```powershell
dotnet run --project backend/src/Bitacora.Api --no-launch-profile -- create-user
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ASPNETCORE_URLS = 'http://127.0.0.1:5080'
dotnet run --project backend/src/Bitacora.Api --no-launch-profile
```

En Linux usar variables de entorno equivalentes. Development solo permite
peticiones desde loopback. Fuera de Development las rutas `/api` requieren HTTPS
y cookies Secure; falta configurar el proxy y destino antes del despliegue real.
Salud en `/health`; no hay pantalla de login ni documentación interactiva aún.

`Storage__Directory` permite elegir un directorio privado persistente. Por defecto
se usa `.data` bajo el directorio de contenido de la aplicación. Contiene
`bitacora.db` y `keys/` para proteger cookies entre reinicios. No incluirlo en Git,
imágenes, artefactos de CI ni copias públicas. En Linux el directorio se crea con
permisos del propietario. En Windows verificar permisos del usuario del proceso.
Las claves y el contenido SQLite no tienen cifrado específico en disco.

Cuotas por cuenta: 100 copias y 100 MiB de JSON UTF-8 por defecto, configurables
con `Storage__MaxTripsPerUser` y `Storage__MaxBackupBytesPerUser` positivos.
El control es transaccional también para actualizaciones y peticiones simultáneas;
un rechazo devuelve 409 sin modificar la copia. Ver [contrato](../docs/public/api.md).

Respaldar la base con el proceso detenido y conservar las claves en privado;
volver a arrancar y comprobar salud. Migración inicial mediante `user_version=1`;
una versión futura desconocida detiene el arranque sin recrear ni borrar la base.
No hay restablecimiento de contraseña ni inscripción pública en esta entrega.

Se usa Microsoft.Data.Sqlite.Core junto al bundle nativo SQLitePCLRaw actualizado;
`packages.lock.json` fija dependencias. Restauración con auditoría de NuGet y
warnings como errores, sin omitir advertencias de dependencias vulnerables.
