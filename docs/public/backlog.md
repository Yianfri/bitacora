# Estado y siguientes entregas

## Implementado

- Angular/PWA con presentación responsive, tema claro/oscuro y movimiento reducido.
- Diseño aprobado aplicado en Angular: superficies crema, texto carbón,
  acento naranja quemado, tipografía sans y paisaje decorativo ficticio.
  Escritorio con navegación lateral, índice y jornada; móvil con navegación
  inferior y vistas Jornada, Itinerario y Diario. [Dirección visual](direccion-visual.md).
- Demo ficticia y lectura local de un respaldo propio con revisión.
- Itinerario por bloques de siete jornadas y un detalle abierto a la vez.
- Crear/editar diario, kilómetros compartidos por fecha y borrador recuperable.
- Navegación anterior/siguiente entre jornadas y bloques; diario por fecha real
  con edición de entradas; Mi copia reúne exportación, restauración e instalación.
- Iconos PWA de 192 y 512 px y guía de instalación; botón cuando el navegador
  entrega el evento correspondiente. La instalación física sigue pendiente.
- Verificación local de esta iteración: formato, lint, tipos, 23 pruebas de
  dominio/almacenamiento, compilación sin advertencias y 9 recorridos en Edge.
  Incluye claro/oscuro, movimiento reducido, teclado, 320/390/736/1024/1440 px,
  borradores, edición desde Diario, restauración y recarga/escritura sin red.
  Los eventos de instalación son simulados; no se ha instalado en un equipo físico.
- Guardado transaccional IndexedDB; exportación y restauración con validación.
- Pruebas de dominio, concurrencia, respaldo, teclado y recorrido offline en navegador.
- CI remoto comprobado: formato, código, tipos, 17 pruebas de dominio, 6 recorridos
  en Chromium, compilación, revisión de publicación, construcción Docker y salud HTTP.
  [Ejecución aprobada de la versión 1565bcf](https://github.com/Yianfri/bitacora/actions/runs/38162052646).
- Publicación de imagen preparada y desactivada; despliegue al servidor pendiente.
- Backend ASP.NET Core .NET 10 y SQLite: cuentas administrativas, sesiones
  revocables, antiforgery, aislamiento por usuario, listado y guardado/recuperación
  de copias completas con control de revisión. Angular todavía no lo consume.
- Verificación local del backend: compilación sin warnings y 13 pruebas HTTP
  contra SQLite real, incluidos datos inválidos, concurrencia, reinicio y logout.
- CI del backend y frontend aprobado para 9e3a78b: formato, compilación y 13
  pruebas de API en Linux, más los recorridos PWA y comprobación Docker existentes.
  [Ejecución aprobada](https://github.com/Yianfri/bitacora/actions/runs/38168967249).
  Código incorporado a main mediante [PR 1](https://github.com/Yianfri/bitacora/pull/1).

### Correcciones de seguridad

- Validación de fuentes indexada una vez por operación, con límites explícitos de
  tamaño y complejidad; formato v1, texto original y datos locales conservados.
- Cuotas por cuenta comprobadas en la transacción de guardado, incluyendo bytes
  UTF-8, actualizaciones y peticiones simultáneas; rechazo 409 sin cambiar la copia.
- Herencia de cabeceras de seguridad en Nginx y CSP para impedir enmarcado.
  CI verifica las respuestas de la imagen en HTML, navegación, PWA, salud y errores.
- Verificación local: 23 pruebas de dominio, 15 pruebas HTTP/SQLite y 6 recorridos
  PWA en Edge, además de formato, lint, tipos, compilación y revisión de publicación.
  La revisión independiente del parche no encontró un bypass ni una regresión concreta.
  El ensayo Nginx de esta corrección se ejecuta en GitHub; Docker local no está activo.

## Mantenibilidad y preparación local

- EF Core 10.0.8 con LINQ, entidades separadas, migraciones/snapshot y adopción
  controlada del esquema previo, sin recrear sus cuentas, sesiones o copias.
- Endpoints por función y DTO separados. Convenciones de código/comentarios,
  formato C#, analizadores .NET y ESLint con información de tipos.
- 18 pruebas .NET (unitarias de dominio e integración de migraciones), además de
  15 HTTP, 23 de dominio frontend y los recorridos PWA existentes.
- Producción requiere migraciones previas; CI comprueba modelo sin cambios pendientes.
- Acceso privado con Tailscale Serve y actualizador pull propuestos; se retira el
  workflow de ejecutor personal en el repositorio público. No conectados al servidor.

## Entregas pendientes

El concepto aprobado ya está implementado en Angular para escritorio, tablet y
móvil. La recomendación sigue siendo web responsive y PWA instalable; APK queda
como opción posterior. Falta probar instalación física y acceso entre dispositivos.
API implementada como servicio separado; integración con las pantallas pendiente.

1. Probar instalación, cierre/reapertura y almacenamiento en Android físico.
2. Selector de varios viajes, creación de planes y catálogo de lugares.
3. Ensayar mapa integrado, proveedor y comportamiento sin red.
4. Conectar Linux, HTTPS y despliegue manual con recuperación; después automatizar.
5. Integrar Angular con sesión y guardado/recuperación explícitos de copias remotas.
6. Sincronización automática y resolución de cambios entre dispositivos.

Las decisiones y fechas personales de cada viaje permanecen fuera del repositorio.

## Continuidad acordada

Dirección de continuidad definida en la
[decisión de arquitectura](decision-arquitectura.md): uso personal inicial,
PWA instalable en PC y Android, trabajo offline y copias privadas explícitas.
El diseño y el flujo PWA están implementados localmente; falta la instalación
física. Después, conectar las pantallas con la API existente y ensayar su despliegue en Linux.
La integración Angular → ASP.NET Core → SQLite privado incluirá pantalla de acceso,
guardar una copia del viaje en el servidor y recuperarla desde otra sesión
autenticada, con revisión antes de reemplazar datos locales. Contrato disponible
en [API](api.md); distinguir guardado local, remoto y conflicto de revisión, y
resolver edición durante envío, timeouts, cambio de cuenta y límites de tamaño.

La normalización para edición remota por entidad, colaboración y sincronización
automática requiere otra entrega; el modelo actual sigue siendo de copias completas.
El despliegue real requiere identificar el servidor Linux, revisar HTTPS/proxies,
permisos y copias recuperables; puede desarrollarse y probarse primero en el PC.
