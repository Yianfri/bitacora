# GitHub, Docker y Linux

Rama propia → pull request → CI → merge a main. Un fork sirve para colaboración
externa; para trabajo personal bastan ramas. Clonar el código desde otro PC no
traslada el diario: los respaldos son archivos independientes y privados.

CI instala el lockfile, comprueba formato/código/tipos, ejecuta pruebas de dominio,
compila, revisa el contenido publicable y prueba Chromium. Construye Docker,
comprueba Nginx y solicita `/health` y `/`. Ejecuta en GitHub, no en el Linux personal.
Un segundo trabajo restaura .NET con lockfile, verifica formato, compila y prueba
la API contra SQLite temporal y datos ficticios. La receta Docker actual continúa
sirviendo el frontend; incluir la API, su volumen privado y proxy HTTPS es otra
entrega que requiere revisar el destino.

## Ensayo con Docker

Desde la raíz:

```sh
docker compose -f deploy/compose.local.yaml up --build -d
```

Abrir `http://localhost:8088`. El contenedor sirve sólo el frontend y demo ficticia.
Los datos del usuario siguen en su navegador. Para una PWA en Android fuera de
localhost hace falta HTTPS; el HTTP de LAN no basta para ese ensayo.

## Servidor con Dockge

Destino SSH y acceso HTTPS se acuerdan antes de desplegar. La stack prevista es
`/opt/stacks/bitacora`, con compose.yaml, update.sh y `.env` preparado a partir
del ejemplo. La imagen se fija por SHA de commit en GHCR. Credenciales de lectura
del registro se guardan en el servidor; nunca en Git.

| Variable de GitHub | Efecto |
| --- | --- |
| ENABLE_IMAGE_PUBLISH=true | Publica una imagen tras pasar CI de main. |
| ENABLE_SERVER_DEPLOY=true | Permite usar el ejecutor Linux del repositorio. |
| ENABLE_AUTO_DEPLOY=true | Permite despliegue automático tras CI exitoso. |
| BITACORA_STACK_PATH | Debe ser /opt/stacks/bitacora. |

Las variables están desactivadas inicialmente. El ejecutor usa etiqueta bitacora
y entorno linux-local. No hace checkout ni ejecuta scripts de PR en el servidor:
usa el update.sh instalado allí. Registrar un ejecutor en un repositorio público
requiere revisar permisos y protección del entorno antes de habilitarlo.

update.sh descarga la imagen, conserva `.env.previous`, levanta con espera de
salud y restaura la configuración anterior si falla. Probar actualización y
recuperación en Linux antes de automatizar. Respaldar contenedores no respalda
el diario local. La API/sincronización no forma parte de esta imagen.
