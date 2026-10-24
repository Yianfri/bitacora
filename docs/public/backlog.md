# Estado y siguientes entregas

Este documento resume el estado actual del código y las próximas entregas. Los
resultados de entregas antiguas permanecen en el historial de Git; no representan
la cantidad actual de pruebas ni el estado del servidor personal.

## Implementado en la aplicación

- Angular/PWA responsive para escritorio, tablet y móvil, tema claro/oscuro,
  movimiento reducido, teclado y controles accesibles. [Dirección visual](direccion-visual.md).
- Demo ficticia; importación y restauración de respaldos con validación y revisión.
- Itinerario por bloques de hasta siete jornadas, consulta de alojamiento y
  abastecimiento, navegación anterior/siguiente y selección de fecha.
- Diario por fecha real, creación/edición de notas y kilómetros sin duplicar la
  jornada. Borradores recuperables y guardado transaccional en IndexedDB.
- Exportación de un respaldo completo. Formato v1, identificadores históricos,
  extensiones, fuentes originales y hashes conservados.
- PWA con manifiesto, iconos y caché de aplicación. Preparación sin conexión y
  ayuda de instalación; los eventos de instalación se prueban de forma simulada.
- Angular conectado a ASP.NET Core .NET 10 y SQLite mediante Mi copia: sesión,
  vinculación explícita del perfil, listado, guardado y recuperación con revisión.
- Cuotas transaccionales, autorización por propietario, antiforgery y revisión
  condicional. Conflictos, edición entre pestañas y respuestas perdidas conservan
  los datos y evitan confirmar un guardado remoto inexistente.
- IndexedDB v2 con asociaciones por origen/cuenta, operaciones inciertas y archivo
  de copias reemplazadas. El archivo existe en almacenamiento; aún no tiene una
  pantalla para consultarlo y recuperar versiones locales anteriores.
- Estado de servidor no disponible, reconexión manual sin recargar y descarga de
  la copia local durante una caída. Volver a conectar no sube cambios automáticamente.

## Preparado para ejecutar y comprobar

- API por funciones y DTO separados, EF Core con LINQ, migraciones versionadas,
  adopción del esquema anterior y rechazo de esquemas incompatibles.
- Lanzador local y Compose de prueba: frontend, proxy, API y SQLite/claves
  persistentes, con cuentas aleatorias privadas para la instalación de prueba.
- Compose de producción con API sin puerto público y web en loopback por defecto.
  La receta requiere configurar HTTPS y migraciones antes de utilizarse en Linux.
- CI en ejecutores de GitHub: formato, lint, tipos, dominio/almacenamiento,
  migraciones .NET, HTTP/SQLite, navegador/PWA, integración real y Docker/Nginx.
- Publicación de imágenes web/API condicionada a `main` y
  `ENABLE_IMAGE_PUBLISH=true`. Publicar en GHCR no despliega la aplicación.
- La integración y su corrección de CI quedaron incorporadas mediante el
  [PR 4](https://github.com/Yianfri/routale/pull/4), con
  [comprobaciones aprobadas](https://github.com/Yianfri/routale/actions/runs/40127107559).

La mejora de disponibilidad tiene 41 pruebas frontend, 9 recorridos PWA y 7
recorridos de integración comprobados en Chromium del entorno de desarrollo.
La integración usa API y SQLite temporales e incluye caída, edición y exportación
sin conexión, reinicio y reconexión sin envío automático. Los resultados deben
quedar reflejados también en los checks de la PR. Esto no verifica el servidor
personal ni Android físico.

## Código que puede avanzar sin el servidor personal

| Prioridad | Entrega pendiente | Criterio para completarla |
| --- | --- | --- |
| 1 | Editor de jornadas y del viaje | Editar alojamiento/estado, abastecimiento, traslados, plan B y presupuesto; después agregar/modificar jornadas y etapas con validación. Hoy solo se editan notas y kilómetros reales; el plan se incorpora desde un respaldo o la demo. Conservar IDs, fuentes originales y extensiones. |
| 2 | Sincronización automática cuando sea posible | Con la app abierta, conexión y servidor disponible, enviar cambios pendientes y comprobar cambios remotos de la cuenta vinculada. Conservar trabajo offline, detectar conflictos y no reemplazar ediciones sin revisión. Requiere una entrega específica; aún no está implementada. |
| 3 | Selector de viajes locales | La persistencia ya conserva varios viajes; falta elegir el activo y conservar su selección sin mezclar notas, borradores ni asociaciones remotas. |
| 4 | Catálogo editable de lugares | Crear y editar lugares y sus vínculos con jornadas, sin inventar coordenadas ni perder datos desconocidos. |
| 5 | Consultar copias locales reemplazadas | Exponer el archivo ya conservado al recuperar, con vista previa y comprobación de ediciones concurrentes antes de restaurar. |
| 6 | Herramientas de respaldo operativo | Respaldar y restaurar SQLite y claves consistentemente en un entorno aislado y comprobar integridad, sesión y lectura antes de utilizarlas en producción. |

El orden es una propuesta para las próximas PR. El editor y la sincronización
automática son objetivos solicitados, no capacidades ya entregadas. La sincronización
necesita activación explícita por perfil/cuenta, cambios pendientes durables,
precondiciones de revisión, recuperación de respuestas perdidas y reintentos acotados.
Volver a tener internet no demuestra que el servidor responda. Con la app cerrada,
una PWA no garantiza ejecutar tareas de sincronización en segundo plano.

Mapa integrado, proveedor y disponibilidad de cartografía sin red necesitan una
decisión explícita y otra entrega. Historial remoto de versiones, colaboración,
gestión pública de cuentas y empaquetado nativo se priorizarán según el uso real.

## Mantenibilidad antes del editor y la sincronización

La revisión de responsabilidades identifica estos cambios acotados para próximas
PR. Son pendientes de refactorización, no defectos de seguridad confirmados ni
motivo para reescribir toda la aplicación:

- Unificar los tipos de estado, resumen y vista previa de copias que hoy se
  declaran tanto en `RemoteCopiesService` como en `RemoteCopiesView`. Mantener
  contratos compartidos independientes de Angular y de la persistencia para que
  agregar estados no obligue a actualizar definiciones duplicadas.
- Separar progresivamente la comparación de contenido y reconciliación de envíos
  de la sesión y recuperación en `RemoteCopiesService`, conservando precondiciones,
  resultados inciertos y pruebas actuales. Extraer responsabilidades al implementar
  la sincronización; evitar capas o interfaces sin un consumidor real.
- Separar la actividad remota del bloqueo general en `App.remoteAction` antes de
  agregar trabajo en segundo plano. Un envío lento no debe impedir escribir y
  guardar una nota local; probar latencia, desconexión y edición durante el envío.
- Implementar las futuras ediciones del plan como operaciones de dominio y
  repositorio, con una transacción y comprobación de versión local. Los componentes
  editan formularios, no IndexedDB directamente. Probar dos pestañas, datos inválidos
  y conservación de fuentes, extensiones y asociaciones remotas.

## Revisión de seguridad pendiente

Programar una auditoría del repositorio antes de activar sincronización automática
o desplegar con datos reales. Los checks aprobados y la revisión de mantenibilidad
no constituyen una auditoría de seguridad completada. El alcance debe incluir:

- Sesiones, expiración/revocación, antiforgery y aislamiento por propietario; cambio
  de cuenta entre pestañas y origen/perfil de los datos locales.
- Importación, límites de cuerpo/complejidad, campos desconocidos, enlaces externos
  y renderizado de notas; archivos inválidos deben conservar el cuaderno existente.
- Revisión condicional, cuotas, concurrencia y respuestas perdidas. La futura
  sincronización no debe mezclar cuentas ni repetir escrituras sin comprobar estado.
- Cookies y proxies de confianza, HTTPS, exposición de puertos, cabeceras y caché
  de respuestas privadas en el stack integrado.
- Dependencias npm/NuGet, acciones y contenedores, permisos CI, exclusión de datos
  privados del build y ausencia de secretos/cuerpos personales en logs o artefactos.
- Procedencia de imágenes, volumen/claves, permisos, respaldo y restauración. La
  revisión del código y la revisión operativa del Linux son comprobaciones distintas.

Para cerrar este pendiente se requiere un informe con alcance, evidencia,
hallazgos validados y límites; corregir lo reportable en cambios separados y
verificar las correcciones. No registrar recomendaciones como vulnerabilidades
sin demostrar su alcance e impacto.

## Validación pendiente en dispositivos físicos

- Instalar la PWA en Windows y Android, cerrar/reabrir y probar consulta/escritura
  sin red después de preparar la aplicación.
- Recorrer PC → guardar copia → Android → revisar/recuperar con el mismo origen
  HTTPS. Verificar también qué sucede con el servidor apagado y al volver.
- Comprobar almacenamiento y exportación en esos navegadores. Una instalación
  PWA no impide que el usuario borre los datos ni sustituye un respaldo.

## Trabajo pendiente en Linux

Existe un inventario previo de solo lectura; Routale todavía no está desplegada.
La [guía de despliegue](despliegue.md) y la
[revisión operativa](despliegue-seguro.md) describen el trabajo restante:

1. Completar la revisión de acceso, firewall, permisos e ingreso HTTPS privado
   mediante Tailscale Serve. Mantener un origen estable y Funnel desactivado.
2. Ensayar un respaldo y una restauración de SQLite y claves en un volumen aislado.
   Elegir destino separado, frecuencia y retención antes de guardar datos reales.
3. Desplegar manualmente imágenes revisadas, ejecutar la migración separada y
   comprobar salud, sesión, guardado, reinicio y recuperación desde dos dispositivos.
4. Implementar y comprobar procedencia de imágenes, recuperación y supervisión;
   automatizar las actualizaciones solo después de que el procedimiento manual
   completo sea repetible. `update.sh` todavía rechaza el stack con API.

El navegador es la copia de trabajo y el servidor conserva la última copia enviada
explícitamente. Un servidor apagado no impide editar localmente, pero sí guardar o
recuperar copias remotas y cargar la aplicación por primera vez en otro dispositivo.
El servidor conserva una sola versión remota por viaje; incrementar su revisión no
crea historial. Las decisiones y los datos personales permanecen fuera de Git.
