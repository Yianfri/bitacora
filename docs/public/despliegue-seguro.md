# Propuesta de despliegue seguro en Linux

Estado: inspección de solo lectura del Linux real, sin desplegar Routale. Se
confirmaron Ubuntu 24.04 LTS x86_64, Docker Engine 29.7.2 y Docker Compose
5.4.0. El inventario actual contiene Dockge y otros servicios; Routale todavía
no está instalada allí. No se revisaron el firewall del host/router ni la
política administrativa de acceso de Tailscale. Esta revisión no registra el
hostname, cuenta, dirección privada ni digest del servidor.

Complementa [despliegue](despliegue.md), [decisión de arquitectura](decision-arquitectura.md),
[API](api.md) y [migraciones](migraciones.md).

## Estado comprobado

- La CI usa ejecutores alojados por GitHub también para `pull_request`; no hay
  un runner propio en el Linux. Las acciones externas del workflow están fijadas
  por SHA completo. El job de publicación solo corre en `main` cuando
  `ENABLE_IMAGE_PUBLISH` vale `true`; el valor configurado en GitHub no se
  inspeccionó.
- Ese job publica dos imágenes, la web integrada con el proxy HTTPS y la API.
  Devuelve sus digests y etiqueta las imágenes con versión y revisión OCI. El
  workflow declara `contents: read` global y `packages: write` solo para
  publicar en GHCR con `GITHUB_TOKEN`. No solicita `id-token` ni
  `attestations`: no incorpora firma y verificación de procedencia para autorizar
  un despliegue, ni conecta con el servidor. Los metadatos que pueda generar
  BuildKit por defecto no sustituyen esa política de confianza.
- `deploy/compose.yaml` configura API y web separadas, API sin puerto del host,
  red interna y un volumen persistente. El bind web es loopback por defecto,
  pero el `.env` privado puede cambiarlo.
- `deploy/update.sh` rechaza el stack integrado con API. En modo frontend aislado
  solo reemplaza `BITACORA_IMAGE`. Acepta una etiqueta de
  commit o digest, descarga la web y restaura `.env` si falla `compose up`; no
  actualiza `BITACORA_API_IMAGE`, verifica atestaciones, respalda SQLite/claves
  ni ejecuta la migración separada. Todavía no es un procedimiento de producción.
- El smoke local reportado para la pila completa verificó la API real con
  SQLite y datos de demostración: escritura con ETag, conflicto 412 y
  persistencia de cookie/CSRF, base y claves al reiniciar la API. Esto no prueba
  una instalación, respaldo o restauración en el Linux.
- En el Linux no apareció ningún servicio Routale ni almacenamiento suyo que
  pudiera auditar. Por eso todavía no se ha verificado cifrado de disco,
  respaldo de datos reales ni restauración en ese equipo.

## Acceso de red actual

Dockge ejecuta la versión 1.5.0 desde la etiqueta mutable
`louislam/dockge:1`. Su puerto web está ligado a loopback; Tailscale Serve lo
publica por HTTPS para el tailnet. Las salidas textuales actuales de
`tailscale serve status` y `tailscale funnel status` indican `tailnet only`;
los JSON consultados no contienen `AllowFunnel`. No hay evidencia de Funnel
público activo en esta configuración.

La política efectiva de Grants/ACL no se revisó, así que el estado tailnet-only
no demuestra qué identidades pueden llegar a Dockge. Antes de usar Serve para
Routale, revisar esa política y limitar el acceso a los dispositivos o
identidades necesarios. Mantener Funnel apagado. El firewall y la exposición
externa de los listeners del servidor tampoco se comprobaron.

## Dockge requiere una corrección upstream verificable

La inspección confirmó que el contenedor de Dockge corre como UID 0 y monta el
socket Docker con escritura; las opciones reportadas por Docker no muestran
daemon rootless. Docker advierte que controlar el socket del daemon puede dar
autoridad equivalente a root sobre el host.

La base de Dockge no tiene guardado `disableAuth`; en la versión inspeccionada,
ese valor ausente conserva la autenticación requerida. No se leyeron usuarios,
hashes ni contraseñas. Mantener autenticación habilitada no elimina la
vulnerabilidad para usuarios autenticados.

La GitHub Advisory Database publicó
[GHSA-r5ph-2fqc-qvf3 / CVE-2026-73040](https://github.com/advisories/ghsa-r5ph-2fqc-qvf3):
un usuario autenticado puede usar nombres de stack con traversal para leer
archivos `.env`/Compose y borrar directorios fuera de la carpeta administrada.
La descripción del aviso enlaza las líneas vulnerables de Dockge 1.5.0, la
misma versión que corre en este equipo, pero el aviso todavía marca las
versiones afectadas y corregidas como `Unknown`; el [reporte upstream #994](https://github.com/louislam/dockge/issues/994)
sigue abierto. No se puede afirmar que la imagen observada esté corregida.

Hasta que upstream publique una versión corregida verificable, mantener Dockge
solo para administración confiable, con acceso tailnet estrictamente limitado.
No usarlo como plano de administración automatizado de Routale ni desactivar
su autenticación. La exposición tailnet-only reduce alcance, pero la combinación
de esta vulnerabilidad, UID 0 y socket escribible hace necesario cerrar primero
la revisión de ACL y esperar una corrección verificable.

## Ruta segura para Routale

### Trabajo que puede avanzar sin cambiar el Linux

1. Mantener los PR y sus pruebas en ejecutores alojados por GitHub. No ejecutar
   código de PR en el Linux personal, no registrar allí runners self-hosted y
   no entregar a Actions claves SSH, Docker remoto ni secretos administrativos.
2. Mantener permisos mínimos por job y revisar los cambios de `.github/workflows/`.
   Antes de publicar versiones para instalar, emitir atestaciones para ambas
   imágenes y verificarlas por repositorio, workflow y referencia `main`.
   Digest identifica contenido; una etiqueta de commit por sí sola no sustituye
   esa comprobación.
3. Completar un actualizador que trate web y API como una sola versión: exigir
   digests, verificar procedencia, respaldar base y claves juntas, ejecutar la
   migración como paso único y tener un rollback que restaure imágenes, base y
   claves compatibles. Probar el flujo completo con datos ficticios y una copia
   aislada.
4. Mantener SQLite en disco local persistente. Cifrar `/data` y las copias de
   seguridad con controles del sistema; las claves persistidas de Data
   Protection no se cifran automáticamente solo por elegir una carpeta.
   Ensayar restauración con `PRAGMA integrity_check` y
   `PRAGMA foreign_key_check`.

La implementación de backend guarda `bitacora.db` y las claves de Data
Protection bajo `Storage__Directory`. El arranque no ejecuta migraciones de
producción: deben completarse con la imagen de API aprobada antes de iniciar la
nueva web. Una copia en caliente debe usar la Online Backup API de SQLite o
detener el escritor y copiar base y claves como una sola operación. Evitar
NFS/SMB para la base SQLite.

### Trabajo que necesita una decisión del propietario

1. Confirmar y restringir la política Grants/ACL efectiva para Serve; identificar
   los servicios/listeners que siguen fuera del inventario y revisar el firewall.
2. Definir si se mantiene Dockge mientras no exista un parche verificable. Si se
   conserva, permitir acceso solo a la identidad administrativa necesaria y
   comprobar de nuevo que Funnel siga mostrando `tailnet only`.
3. Revisar cifrado del volumen y destino/frecuencia de copias de seguridad.
   Hacer la primera restauración en un volumen aislado antes de almacenar
   itinerarios reales.
4. Cuando lo anterior esté aprobado, desplegar manualmente web y API por digest,
   ejecutar la migración una sola vez y verificar salud, autenticación,
   cookies seguras, persistencia y restauración. Operar manualmente hasta que
   estas comprobaciones sean repetibles; después decidir si hace falta un
   actualizador pull local separado de la stack.

No se establecen RPO/RTO ni frecuencia de actualización sin conocer la pérdida
de datos tolerable. Este documento no afirma que Routale esté desplegada en el
servidor ni que se haya ejecutado allí una migración.

## Fuentes primarias

- [Uso seguro de GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use),
  [ejecutores self-hosted](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners),
  [atestaciones](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)
  y [gh attestation verify](https://cli.github.com/manual/gh_attestation_verify).
- [Socket de Docker](https://docs.docker.com/engine/security/protect-access/),
  [seguridad del Engine](https://docs.docker.com/engine/security/),
  [daemon rootless](https://docs.docker.com/engine/security/rootless/)
  y [referencias por digest](https://docs.docker.com/reference/cli/docker/image/pull/).
- [Dockge README](https://github.com/louislam/dockge/blob/master/README.md),
  [Compose oficial](https://github.com/louislam/dockge/blob/master/compose.yaml),
  [GHSA/CVE](https://github.com/advisories/ghsa-r5ph-2fqc-qvf3),
  [issue upstream #994](https://github.com/louislam/dockge/issues/994) y
  [releases](https://github.com/louislam/dockge/releases).
- [Tailscale Serve CLI](https://tailscale.com/docs/reference/tailscale-cli/serve),
  [Funnel CLI](https://tailscale.com/docs/reference/tailscale-cli/funnel),
  [Grants](https://tailscale.com/docs/features/access-control/grants) y
  [Serve](https://tailscale.com/docs/features/tailscale-serve).
- [Persistencia de claves de Data Protection](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/overview?view=aspnetcore-10.0),
  [SQLite Online Backup API](https://sqlite.org/backup.html),
  [uso de SQLite en red](https://www.sqlite.org/useovernet.html) y
  [comprobaciones de integridad](https://sqlite.org/pragma.html).
