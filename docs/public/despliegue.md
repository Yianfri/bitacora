# GitHub, Docker y acceso privado en Linux

## Estado real

CI de PR y main se ejecuta en máquinas de GitHub. Comprueba frontend, pruebas
unitarias .NET, migraciones, API sobre SQLite temporal, contenido publicable y
la imagen Nginx con sus cabeceras reales. Publicar imágenes sigue condicionado
a ENABLE_IMAGE_PUBLISH=true y una versión aprobada de main.

El job `image` se omite en las PR y cuando esa variable no está habilitada.
Es el publicador de imágenes en GHCR; el job `checks` construye y comprueba la
imagen web/Nginx independientemente de publicar. Ni ese job ni publicar en GHCR
despliegan servicios en el Linux. La protección de `main` se configura por separado
en los rulesets de GitHub: el YAML define los checks y la regla exige que pasen.

Las recetas Docker/Compose incluyen frontend, API sin puertos publicados y un
volumen privado para SQLite y claves. El stack local está ensayado; la instalación
Linux existente se revisa por separado, sin desplegar ni cambiar sus servicios.
Los resultados sensibles de inventario permanecen en notas privadas.

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
PC y móvil se obtiene guardando y recuperando copias autenticadas mediante
la API integrada. Eso tampoco equivale a sincronización automática.

El diseño y las copias se han ensayado con datos ficticios en el PC. También se
identificó el Linux y se hizo un inventario autorizado de solo lectura; no se
activaron servicios ni se ejecutó un despliegue remoto. Los hallazgos y límites
están en [revisión de seguridad](despliegue-seguro.md); la información de acceso
permanece fuera de Git. Falta cerrar HTTPS, permisos, procedencia y recuperación.

El CI prepara ambas imágenes después de las comprobaciones, incluida integración
real de navegador/API/SQLite. Solo publica con main y ENABLE_IMAGE_PUBLISH=true;
no despliega en Linux. Las acciones se fijan por SHA; los outputs incluyen digests,
pero todavía falta atestación y comprobación de procedencia en el servidor.
La guía pública vigente sustituye cualquier plan anterior de ejecutor self-hosted.

## Acceso recomendado: Tailscale Serve

Mantener web/proxy en loopback y API/base en la red privada de contenedores.
Tailscale Serve ofrece HTTPS a dispositivos autorizados del tailnet, sin comprar
un dominio propio. Android y PC deben tener Tailscale instalado y conectado,
y las reglas de acceso deben limitar quién llega al servicio.

El enlace tendrá la forma de ejemplo `https://routale.nombre-del-tailnet.ts.net`.
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

update.sh es un ayudante manual para el frontend aislado y rechaza el stack con API:
descarga una imagen,
conserva .env.previous y comprueba salud. La etiqueta/digest es inmutable, pero
su formato no demuestra procedencia ni aprobación. No usarlo como verificador de
versiones ni como rollback de base de datos.

## Ensayo Docker local conjunto

```sh
docker compose -f deploy/compose.local.yaml up --build -d
node frontend/tools/check-http-security.mjs http://localhost:8088
node frontend/tools/prepare-docker-local.mjs
node frontend/tools/check-stack.mjs --restart
```

Sirve la aplicación en http://localhost:8088. Importar y escribir el diario son
operaciones locales; Mi copia permite enviar una copia explícitamente tras el login.
El acceso de prueba aleatorio permanece en .data/docker-local/access.json, fuera de
Git. La API Development está aislada en la red interna; solo el proxy declarado
y loopback pasan su control. La web publica únicamente el puerto loopback.
Detener con compose stop conserva el volumen. Nunca usar down -v para actualizar.
Nginx conserva DENY, nosniff, Referrer-Policy y CSP frame-ancestors con
Cache-Control no-cache en HTML y Service Worker.

Antes de usar compose.yaml en Linux: elegir las dos imágenes integradas revisadas,
preparar un volumen y claves privados, respaldar y ejecutar el comando migrate
como paso independiente. nginx.stack.conf asume un ingreso HTTPS de confianza
hacia el puerto loopback; no usar esa configuración directamente por HTTP público.
Ver [revisión de seguridad](despliegue-seguro.md) y [migraciones](migraciones.md).

Referencias: [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve),
[certificados HTTPS](https://tailscale.com/docs/how-to/set-up-https-certificates),
[Tailscale Funnel](https://tailscale.com/docs/features/tailscale-funnel),
[seguridad de ejecutores GitHub](https://docs.github.com/en/actions/reference/security/secure-use)
y [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/).
