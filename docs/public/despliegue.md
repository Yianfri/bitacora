# GitHub, Docker y acceso privado en Linux

## Estado real

CI de PR y main se ejecuta en máquinas de GitHub. Comprueba frontend, pruebas
unitarias .NET, migraciones, API sobre SQLite temporal, contenido publicable y
la imagen Nginx con sus cabeceras reales. Publicar imágenes sigue condicionado
a ENABLE_IMAGE_PUBLISH=true y una versión aprobada de main.

La receta Docker y compose actuales sirven el frontend. La API todavía necesita
su imagen, volumen privado y proxy del mismo origen. No se ha conectado ni
configurado el servidor real. Tailscale está disponible en la instalación del
usuario, pendiente de revisar versión, permisos y configuración.

Se retira la propuesta de conectar un ejecutor self-hosted de este repositorio
público al Linux personal. La automatización remota se implementará después de
probar el despliegue manual y su recuperación. No activar las antiguas variables
ENABLE_SERVER_DEPLOY ni ENABLE_AUTO_DEPLOY; ya no controlan un workflow remoto.

## Utilidad del servidor para la siguiente iteración

La [decisión de arquitectura](decision-arquitectura.md) define el alcance inicial
personal, el trabajo offline, el servicio de copias y los criterios de evolución.
La topología descrita allí es objetivo, no una stack completa ya desplegada.

La revisión de diseño y distribución mantiene Linux como una opción útil, sin
dependencia para trabajar sin red tras preparar la PWA. Alojar solo el frontend
permite abrir una versión central de la aplicación; las notas siguen siendo
copias independientes de cada navegador/dispositivo. El valor adicional para
PC y móvil llegará al integrar guardar y recuperar copias autenticadas mediante
la API existente. Eso tampoco equivale a sincronización automática.

Primero se propone ensayar el nuevo diseño y la integración de copias con datos
ficticios en el PC. Después, identificar el equipo Linux real, comprobar sistema,
arquitectura, recursos, puertos y servicios existentes, y definir persistencia de
SQLite, claves y recuperación. Esta revisión fue documental: no se conectó al
equipo ni se comprobó su capacidad. Tampoco se activaron servicios ni se ejecutó
Docker remoto.

La receta actual sigue desplegando solo frontend; completar la API, su proxy y
sus volúmenes es trabajo pendiente. La guía pública vigente sustituye cualquier
plan anterior de ejecutor self-hosted en el servidor personal.

## Acceso recomendado: Tailscale Serve

Mantener web/proxy en loopback y API/base en la red privada de contenedores.
Tailscale Serve ofrece HTTPS a dispositivos autorizados del tailnet, sin comprar
un dominio propio. Android y PC deben tener Tailscale instalado y conectado,
y las reglas de acceso deben limitar quién llega al servicio.

El enlace tendrá la forma de ejemplo `https://bitacora.nombre-del-tailnet.ts.net`.
La dirección real depende del nombre del equipo y el tailnet, y se registra solo
en documentación privada. Revisar los otros servicios Serve del equipo antes de
modificar su configuración. Los nombres usados en certificados HTTPS aparecen
en registros públicos de certificados; elegir nombres genéricos.

Serve comparte dentro del tailnet. Funnel publica hacia Internet y no se habilita
para este uso. Comprobar la configuración existente: habilitar HTTPS no debe
aceptar por accidente una publicación pública. Mantener también login, CSRF,
cookies Secure y autorización de la API.

HTTPS termina en Serve/proxy: antes de conectarlo a producción, definir la cadena
de proxies de confianza y el tratamiento de forwarded headers. No confiar en
cabeceras enviadas directamente por clientes ni habilitar HTTP público. La PWA
requiere HTTPS fuera de localhost. Sin red podrá usar su copia local tras cargarla;
sin el servidor encendido no habrá acceso remoto ni guardado remoto.

Mantener estable el origen HTTPS elegido: cambiar dominio o puerto crea otro
almacenamiento del navegador. Exportar/restaurar antes de trasladar un cuaderno.

Cloudflare Tunnel más Access es otra opción si se desea acceder sin el cliente
Tailscale. Requiere otra configuración e incorpora un intermediario. Con Tailscale
ya instalado, la primera opción recomendada es mantener Linux y acceso privado.

## Flujo de despliegue propuesto

1. Trabajar en una rama y abrir PR; pruebas y compilación en GitHub.
2. Integrar a main una versión revisada y publicar imágenes por commit/digest.
3. Un actualizador instalado y revisado en Linux consulta una versión aprobada,
   verifica procedencia/commit y descarga esas imágenes; no hace checkout ni
   ejecuta instrucciones de PR, forks o scripts descargados del repositorio.
4. Detiene la API, respalda base y claves en privado y aplica [migraciones](migraciones.md)
   con el nuevo binario sobre el mismo volumen.
5. Inicia, comprueba salud y lectura/autenticación, y registra la versión instalada.
6. Si falla, conserva el servicio detenido o vuelve a una versión compatible.
   Si el esquema cambió, restaurar el respaldo probado; no ejecutar Down automáticamente.

Un timer local puede comprobar versiones cada minuto: actualización automática
poco después de publicar, sin credenciales de administración del Linux en GitHub.
Es una propuesta pendiente de implementar y ensayar. No se afirma que exista ya
un agente pull, verificación de procedencia ni recuperación de la API.

update.sh es actualmente un ayudante manual para el frontend: descarga una imagen,
conserva .env.previous y comprueba salud. La etiqueta/digest es inmutable, pero
su formato no demuestra procedencia ni aprobación. No usarlo como verificador de
versiones ni como rollback de base de datos.

## Ensayo Docker del frontend

```sh
docker compose -f deploy/compose.local.yaml up --build -d
node frontend/tools/check-http-security.mjs http://localhost:8088
```

Sirve demo ficticia en http://localhost:8088. El diario permanece en el navegador.
Nginx conserva DENY, nosniff, Referrer-Policy y CSP frame-ancestors con
Cache-Control no-cache en HTML y Service Worker.

Referencias: [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve),
[certificados HTTPS](https://tailscale.com/docs/how-to/set-up-https-certificates),
[Tailscale Funnel](https://tailscale.com/docs/features/tailscale-funnel),
[seguridad de ejecutores GitHub](https://docs.github.com/en/actions/reference/security/secure-use)
y [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/).
