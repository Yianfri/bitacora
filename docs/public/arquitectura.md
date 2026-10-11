# Arquitectura implementada

Frontend Angular 22.2.2 standalone, TypeScript estricto y PWA mediante Angular
Service Worker. No hay backend, API REST de negocio ni sincronización todavía.

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
