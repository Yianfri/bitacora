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

## Pendiente

La entrega visual está aprobada. La siguiente entrega corresponde al backend;
su integración con las pantallas se hará después.

1. Probar instalación, cierre/reapertura y almacenamiento en Android físico.
2. Edición del plan y catálogo de lugares; navegación anterior/siguiente del detalle.
3. Ensayar mapa integrado, proveedor y comportamiento sin red.
4. Conectar Linux, HTTPS y despliegue manual con recuperación; después automatizar.
5. Backend ASP.NET Core: autenticación, persistencia y sincronización entre dispositivos.
6. Definir endpoints y conflictos antes de integrar frontend/backend.

Las decisiones y fechas personales de cada viaje permanecen fuera del repositorio.

## Próxima entrega propuesta

Una primera integración completa Angular → ASP.NET Core → base de datos privada:
acceso protegido, guardar una copia del viaje en el servidor y recuperarla desde
otra sesión autenticada. Diseñar contrato, validación y control de versiones antes
de escribir; conservar el guardado local y distinguirlo del guardado remoto.

La sincronización automática y la resolución de cambios entre dispositivos serán
una entrega posterior. El motor de base de datos y la implementación del acceso
están por definir. El despliegue real requiere identificar el servidor Linux y
revisar HTTPS y permisos; puede desarrollarse y probarse primero en el PC.
