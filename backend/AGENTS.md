# Backend de Bitácora

- ASP.NET Core .NET 10; contrato en `docs/public/api.md` antes de cambiar rutas.
- Endpoints y contratos HTTP por función en `src/Bitacora.Api/Features/Authentication`
  y `Features/Trips`; validación pura en `Domain`, casos de persistencia en `Storage`.
- DTO de entrada/salida en Dtos dentro de cada función; entidades EF nunca salen
  completas por HTTP. El respaldo v1 se recibe como JsonElement validado para
  conservar extensiones, texto de origen y hashes.
- EF Core en `Persistence`, entidades en `Persistence/Entities`, migraciones y
  snapshot en `Persistence/Migrations`. Consultas de negocio en LINQ; SQL específico
  solo en migraciones y la adopción documentada del esquema anterior.
- Un contexto EF por operación mediante factory, nunca un contexto singleton
  compartido. Lecturas AsNoTracking; aislamiento por propietario en cada consulta.
- No agregar capas, interfaces ni carpetas vacías; separar al existir responsabilidad real.
- C# con cuatro espacios, llaves y una instrucción por línea; separar fases con líneas
  en blanco. Comentarios en español para decisiones, invariantes y límites, sin narrar
  operaciones obvias. Revisar `docs/public/convenciones-codigo.md`.
- Cuenta actual desde la sesión, nunca desde un ID de usuario enviado por cliente.
  Consultas siempre limitadas por propietario y parametrizadas.
- Cookies HttpOnly, antiforgery para escrituras, contraseñas con PasswordHasher;
  no registro abierto. Sin credenciales de ejemplo utilizables ni secretos en logs.
- `.data`, bases, claves y respaldos son privados. Pruebas solo con demo ficticia.
- Preservar respaldo v1, campos desconocidos, snapshots y hashes. Validar antes
  de escribir. Comparar revisión y escribir dentro de una misma transacción.
- Compilar con warnings como errores. Pruebas HTTP contra SQLite real incluyen
  autorización, CSRF, datos inválidos, concurrencia, logout y reinicio.
- Frontend mantiene almacenamiento local; esta entrega no implica sincronización.
- Actualizar contrato, privacidad, backlog y CI cuando cambie comportamiento.
- Migraciones registradas en Git y __EFMigrationsHistory. Producción exige el esquema
  actualizado y no aplica migraciones al arrancar; comando migrate en un paso separado.
  No EnsureCreated, borrado, downgrade automático ni reescritura de migraciones aplicadas.
- Pruebas: dotnet test para dominio y migración de SQLite real; mantener los recorridos
  HTTP existentes. CI también comprueba has-pending-model-changes y lockfiles.
