# Migraciones de SQLite con EF Core

El código versionado está en `backend/src/Bitacora.Api/Persistence/Migrations`.
La base privada registra aplicaciones en `__EFMigrationsHistory`. El snapshot
representa el modelo final; CI rechaza cambios de modelo sin migración.
La herramienta dotnet-ef 10.0.8 queda fijada en `dotnet-tools.json`.

## Crear un cambio

Desde la raíz, modificar primero entidades y configuración y luego:

```sh
dotnet tool restore
dotnet ef migrations add NombreDelCambio --project backend/src/Bitacora.Api --output-dir Persistence/Migrations
dotnet ef migrations has-pending-model-changes --project backend/src/Bitacora.Api
```

Revisar Up y Down y probar creación desde cero y actualización con datos ficticios.
Registrar migración, Designer y snapshot en el mismo PR. No modificar una migración
que ya se aplicó a una instalación; agregar otra. Evitar downgrade automático:
puede borrar columnas o datos. No usar EnsureCreated junto con migraciones.

## Aplicar un cambio

Development migra la base al iniciar para facilitar pruebas locales. Producción
exige que el esquema esté actualizado; no lo cambia al arrancar el servidor web.
El comando administrativo `migrate` aplica las pendientes y termina sin abrir HTTP:

```sh
Storage__Directory=/ruta/privada ASPNETCORE_ENVIRONMENT=Production \
  dotnet Bitacora.Api.dll migrate
```

En el Linux, aplicar en una fase separada del despliegue: detener la API, guardar
un respaldo privado de la base y claves, ejecutar migrate con la nueva versión y
el mismo volumen, verificar resultado y recién entonces iniciar la API y probar
salud/login/lectura. Migrar una sola instancia; no ejecutar la herramienta en cada
réplica. No subir la base ni las claves como artefactos de CI.

La ruta real y los permisos se fijarán al revisar el Linux. Todavía no se ejecutó
una migración ni un despliegue remoto. SQLite puede dejar un bloqueo EF si una
migración se interrumpe; detener la aplicación y revisar el estado antes de
intervenir, sin borrar automáticamente su tabla de bloqueo.

## Compatibilidad con la primera API

La primera API marcaba `PRAGMA user_version = 1` y creaba tablas sin historial EF.
`LegacySchema` reconoce columnas, claves, vínculos, unicidad y revisión positiva
antes de registrar InitialStorage como baseline; no recrea tablas. Un esquema
desconocido o incompatible se rechaza sin adoptar ni borrar.
También se rechaza un historial EF con migraciones desconocidas para esta versión;
una imagen anterior no arranca silenciosamente contra un esquema posterior.

AddBackupByteCount agrega el tamaño y calcula bytes UTF-8 de todas las copias
anteriores mediante una migración de datos. La prueba de adopción conserva JSON,
contraseñas hasheadas, sesiones y revisiones; repetir migrate no duplica registros.
SQL específico queda limitado a esta adaptación y a migraciones, con motivos
documentados. Las operaciones ordinarias de cuentas y viajes usan LINQ de EF.

Para recuperación, conservar la versión anterior de la aplicación y su respaldo
previo a migrar. Cambiar solo la imagen no revierte el esquema: revisar compatibilidad
y restaurar la base con el servicio detenido cuando sea necesario. No automatizar
Down como mecanismo de rollback.

Referencias: [aplicar migraciones](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying)
y [limitaciones SQLite](https://learn.microsoft.com/en-us/ef/core/providers/sqlite/limitations).
