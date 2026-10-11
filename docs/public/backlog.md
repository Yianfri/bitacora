# Estado y siguientes entregas

## Implementado

- Angular/PWA con presentación responsive, tema claro/oscuro y movimiento reducido.
- Estilo de cuaderno de ruta aprobado por el usuario y aplicado localmente: paleta
  cálida, títulos con remates, marcadores de jornadas y menor peso en paneles
  auxiliares. Detalles en [dirección visual](direccion-visual.md).
- Demo ficticia y lectura local de un respaldo propio con revisión.
- Itinerario por bloques de siete jornadas y un detalle abierto a la vez.
- Crear/editar diario, kilómetros compartidos por fecha y borrador recuperable.
- Guardado transaccional IndexedDB; exportación y restauración con validación.
- Pruebas de dominio, concurrencia, respaldo, teclado y recorrido offline en navegador.
- CI remoto comprobado: formato, código, tipos, 17 pruebas de dominio, 6 recorridos
  en Chromium, compilación, revisión de publicación, construcción Docker y salud HTTP.
  [Ejecución aprobada de la versión 1565bcf](https://github.com/Yianfri/bitacora/actions/runs/38162052646).
- Publicación de imagen y despliegue al servidor preparados y desactivados.
- Backend ASP.NET Core .NET 10 y SQLite: cuentas administrativas, sesiones
  revocables, antiforgery, aislamiento por usuario, listado y guardado/recuperación
  de copias completas con control de revisión. Angular todavía no lo consume.
- Verificación local del backend: compilación sin warnings y 13 pruebas HTTP
  contra SQLite real, incluidos datos inválidos, concurrencia, reinicio y logout.
- Job de CI del backend agregado; su ejecución remota aún debe comprobarse.

## Pendiente

Diseño aprobado guardado en main. API implementada como servicio separado;
integración con las pantallas pendiente.

1. Probar instalación, cierre/reapertura y almacenamiento en Android físico.
2. Edición del plan y catálogo de lugares; navegación anterior/siguiente del detalle.
3. Ensayar mapa integrado, proveedor y comportamiento sin red.
4. Conectar Linux, HTTPS y despliegue manual con recuperación; después automatizar.
5. Integrar Angular con sesión y guardado/recuperación explícitos de copias remotas.
6. Sincronización automática y resolución de cambios entre dispositivos.

Las decisiones y fechas personales de cada viaje permanecen fuera del repositorio.

## Próxima entrega propuesta

Integración completa Angular → ASP.NET Core → SQLite privado: pantalla de acceso,
guardar una copia del viaje en el servidor y recuperarla desde otra sesión
autenticada, con revisión antes de reemplazar datos locales. Contrato disponible
en [API](api.md); distinguir guardado local, remoto y conflicto de revisión.

La sincronización automática y la resolución de cambios entre dispositivos serán
una entrega posterior. El despliegue real requiere identificar el servidor Linux y
revisar HTTPS y permisos; puede desarrollarse y probarse primero en el PC.
