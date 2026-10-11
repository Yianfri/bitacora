# Backend de Bitácora

- ASP.NET Core .NET 10; contrato en `docs/public/api.md` antes de cambiar rutas.
- Funciones en `src/Bitacora.Api/Features`, validación pura en `Domain`, SQLite
  y transacciones en `Storage`. No agregar capas vacías.
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
