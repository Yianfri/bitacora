# Arquitectura implementada

La [decisión de arquitectura y evolución](decision-arquitectura.md) fija la
dirección elegida para la siguiente entrega: PWA instalable, trabajo local y
copias privadas en Linux. Distingue el modelo actual de las propuestas futuras,
las relaciones de datos y los criterios para crecer. Esta página describe lo
que está implementado; no implica que esa integración o despliegue ya existan.

Frontend Angular 22.2.2 standalone, TypeScript estricto y PWA mediante Angular
Service Worker. Backend ASP.NET Core .NET 10 con EF Core 10 y SQLite como servicio separado;
Angular todavía no consume la API y no hay sincronización automática.

El componente raíz coordina carga, selección del día, importación y navegación.
`features/trip` presenta logística y diario; `features/diary` maneja el formulario
y su borrador. Dominio puro calcula kilómetros, valida referencias y crea/edita
notas. `TripRepository` adapta IndexedDB mediante idb; `CuadernoService` coordina
almacenamiento, lectura de demo, respaldo y restauración.

La jornada real es única por viaje/fecha. Varias notas comparten kilómetros;
agregar una nota no suma distancia dos veces ni completa una etapa prevista.
Plan y diario son entidades independientes. Null significa desconocido, cero
significa que se registró ausencia de kilómetros o gasto.

Zod valida datos externos como unknown; además se comprueban IDs, vínculos,
fechas válidas e integridad SHA-256 de fuentes. Se preservan campos desconocidos
en respaldos compatibles. Jornada y nota se guardan en una transacción y se
confirma éxito después de completarla. Importar demo repetidamente conserva
ediciones propias; restaurar un viaje requiere revisión y reemplaza esa copia.

PC y Android usan la misma presentación responsive, tokens claros/oscuros,
controles nativos, foco visible y movimiento reducido. Angular Material sigue
como opción por evaluar para una necesidad concreta.

El caché PWA permite leer y escribir sin red tras cargar la aplicación. No es
cartografía offline. El mapa integrado y catálogo editable siguen pendientes.
Nginx sirve el frontend y `/health`; ese endpoint no es una API de viajes.

La compilación genera una demo ficticia, sin leer fuentes locales. El formato de
respaldo conserva su identificador histórico para mantener compatibilidad.

## Servicio de copias privadas

`backend/src/Bitacora.Api/Features/Authentication` y `Features/Trips` definen endpoints,
con DTO separados en Dtos dentro de cada función;
`Domain/BackupValidator` valida el respaldo v1 y su integridad sin modificarlo.
`Storage` usa LINQ de EF para cuentas, sesiones revocables y transacciones.
`Persistence` configura el DbContext y sus entidades; `Persistence/Migrations`
contiene migraciones y snapshot versionados. Ver [migraciones](migraciones.md)
y [convenciones](convenciones-codigo.md). Cada operación usa un contexto propio.

Las tablas users y sessions protegen el acceso. trip_copies conserva el JSON
validado completo, propietario, revisión y momento de guardado. Se conserva el
agregado de viaje para no perder campos desconocidos ni fuentes originales;
no hay modelo de edición remota por entidad todavía.

Una transacción con bloqueo de escritura compara la revisión antes de guardar;
dos clientes con la misma revisión no pueden sobrescribirse silenciosamente.
ETag e If-Match permiten mostrar el conflicto en la futura integración.
SQLite se elige para esta instalación personal por su archivo persistente y
ejecución en Windows/Linux sin un servicio adicional de base de datos. Un cambio
de motor requerirá migración y pruebas, no solo cambiar una cadena de conexión.

Cookie de sesión HttpOnly, antiforgery y autorización por propietario; cuentas
creadas con comando local, sin registro abierto. Contrato en [API](api.md).
Directorio de datos y claves privado, independiente del código y la demo.
