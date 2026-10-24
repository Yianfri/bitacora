# Convenciones de código y recorrido del repositorio

## Ubicación y responsabilidades

Angular es el cliente PWA; ASP.NET Core .NET 10 es la API. EF Core 10 mantiene
SQLite. EF es la herramienta de acceso a datos; SQLite sigue siendo el motor.
El contrato HTTP permanece en [API](api.md), separado del almacenamiento local.

En `backend/src/Bitacora.Api`:

- `Features/Authentication/AuthenticationEndpoints.cs`: CSRF, login, usuario actual y logout.
- `Features/Authentication/AccountCommands.cs`: creación administrativa de cuentas.
- `Features/Trips/TripEndpoints.cs`: listado, lectura y guardado de copias privadas.
- `Dtos/` dentro de cada función: contratos de entrada/salida, sin entidades EF ni
  hashes de contraseña. LoginRequest, UserResponse, CsrfTokenResponse y TripMetadata.
- `Domain/BackupValidator.cs`: reglas del respaldo, fechas, referencias e integridad.
- `Storage/AccountStore.cs` y `TripStore.cs`: operaciones completas de cuentas y viajes.
- `Persistence/BitacoraDbContext.cs`: tablas, claves, índices y relaciones EF.
- `Persistence/Entities/`: entidades persistidas, una por archivo.
- `Persistence/Migrations/`: cambios de esquema y snapshot versionados.
- `Persistence/LegacySchema.cs`: adopción controlada del esquema anterior; no consultas de negocio.
- `Program.cs`: composición de dependencias y protecciones HTTP comunes.

Minimal APIs registra rutas en esos archivos; no requiere Controllers. Crear nuevas
carpetas por funcionalidad cuando exista código que agrupar. Extraer una clase si
mantiene una responsabilidad propia; no crear interfaces, servicios intermedios o
proyectos vacíos para anticipar necesidades. En Angular seguir las funciones en
`features/` y las reglas puras/persistencia en `core/`.

## Lectura y comentarios

C# usa cuatro espacios, llaves en líneas separadas y una instrucción por línea.
Separar validación, lectura, decisiones y escritura con líneas en blanco. Mantener
auto-properties y expresiones pequeñas legibles; evitar concatenar operaciones,
catch y return en una línea. Preferir nombres concretos y métodos acotados.

Comentarios en español para explicar el motivo de una decisión, una condición de
compatibilidad, el límite de confianza o un efecto que sería fácil romper. Por
ejemplo, la transacción de cuota/revisión, la comparación SQL de instantes UTC,
el hash ficticio de autenticación y la adopción de la base previa tienen comentarios.
Evitar comentarios que repitan literalmente lo que hace cada instrucción.

Documentar rutas y decisiones en estos documentos; el comentario debe permanecer
cerca de la garantía que protege. Actualizar ambos si cambia el comportamiento.
Las migraciones y sus archivos generados conservan el formato de la herramienta.

## Tipos y herramientas

TypeScript y templates son estrictos. ESLint usa `recommendedTypeChecked` y
`projectService` para rechazar acceso/argumentos de tipo any, promesas sin manejar
y callbacks async incompatibles con void. JSON externo entra como unknown y se
valida antes de leer propiedades; no usar conversiones para acallar diagnósticos.
Los archivos privados `*.local.*` quedan fuera de los comandos estándar.

C# usa nullable, propiedades required, analizadores recomendados de .NET, estilo
comprobado en compilación y warnings como errores. `var` tiene un tipo inferido
estáticamente: usarlo donde el resultado sea claro. Una excepción de analizador
debe ser local y tener una justificación verificable, como la comparación LINQ
de instantes que EF traduce a SQLite BINARY. No desactivar reglas globalmente.

EF crea un contexto por operación mediante factory; no compartir un DbContext
entre peticiones. Usar AsNoTracking para lecturas y LINQ limitado por propietario.
Revisión, cuota y escritura comparten una transacción inmediata. No habilitar
logging de datos sensibles ni serializar entidades persistidas como respuestas
HTTP completas. Mantener los DTO y los contratos deliberados.

## Pruebas y cambios

`backend/tests/Bitacora.Api.Tests/Domain` contiene unit tests xUnit. `Persistence`
contiene integración sobre SQLite temporal: creación, adopción, repetición,
esquema incompatible y conservación de datos. `api.test.mjs` recorre HTTP real:
sesión, CSRF, cuotas, Unicode, ETags, concurrencia y reinicios.
Las pruebas del cliente usan Vitest y Playwright sobre demo ficticia.

Una prueba debe proteger una regla o un fallo observable, incluyendo un control
legítimo. Probar la base real para transacciones/migraciones; el proveedor EF
InMemory no demuestra las garantías de SQLite. Ver comandos en [backend](../../backend/README.md).
CI verifica formato, lint/tipos, unit tests, integración HTTP, modelo/migraciones,
compilación, privacidad del contenido publicable y Docker.

Antes de modificar: leer AGENTS, contrato y llamadas afectadas. Al terminar:
actualizar documentación, revisar el diff, ejecutar comprobaciones y mantener
datos reales fuera de Git. Cambios mediante rama y PR, sin ejecutar forks en el Linux.

### Identidad de los commits

La cuenta que autentica el push y los campos de autor del commit se configuran
por separado. Al trabajar desde otro PC o entorno cloud, comprobar `git config
--show-origin --get user.name` y `git config --show-origin --get user.email` antes
de crear commits. Usar configuración local al repositorio para mantener el nombre
elegido y el correo público `noreply` verificado en GitHub, sin modificar la
configuración global del equipo. Cambiar estos valores afecta a los commits nuevos;
los ya publicados conservan su autor e historial.

Referencias: [convenciones C# de Microsoft](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/coding-style/coding-conventions),
[vida del DbContext](https://learn.microsoft.com/en-us/ef/core/dbcontext-configuration/),
[lint con tipos](https://typescript-eslint.io/getting-started/typed-linting/)
y [pruebas xUnit](https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-csharp-with-xunit).
