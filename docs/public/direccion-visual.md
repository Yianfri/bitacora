# Dirección visual de Routale

Estado: el concepto aprobado está implementado en Angular con adaptación de
escritorio, tablet y móvil. Las láminas conceptuales se mantienen como referencia;
la instalación física y el despliegue en Linux siguen pendientes.

## Dirección aprobada e implementada

El concepto móvil aprobado usa superficies crema claras, texto carbón, acento
naranja quemado y tipografía sans de sistema. La composición combina contenido
abierto, separadores finos e iconos de una misma familia con etiquetas visibles.
Las láminas conceptuales usan datos ficticios; no son capturas de una aplicación
implementada ni prueban funcionamiento, instalación o disponibilidad de servicios.
Se conservan localmente fuera de Git y del build, como material de diseño.

La tarea principal confirmada por el usuario es consultar una jornada, el
alojamiento y el abastecimiento durante una parada. Estos datos determinan la
jerarquía. El diario y las herramientas de copia siguen disponibles, sin competir
con esa consulta inicial.

### Escritorio, tablet y móvil

- Escritorio ancho: navegación lateral, índice de jornadas y detalle seleccionado
  en una zona flexible. Punto de partida a ensayar: navegación de 180–200 px,
  índice de 240–270 px y detalle con espacio suficiente para leer sin comprimir
  alojamiento y abastecimiento. No agregar una cuarta columna de herramientas.
- Cerca de 1024 px: reducir navegación y comprobar si caben índice y detalle;
  plegar el índice cuando perjudique la lectura. Los puntos de quiebre se ajustan
  por contenido, no por nombres comerciales de dispositivos.
- Tablet estrecha: navegación superior y selección explícita de jornada. Desde
  unos 900 px se puede ensayar índice más detalle; por debajo, una columna.
- Móvil: destinos Jornada, Itinerario y Diario con icono, texto y controles de
  al menos 44 px. Si la navegación inferior permanece fija, reservar su altura
  y el área segura, y comprobar que no tape contenido, errores ni teclado.
- Jornada refleja la selección del usuario, sin inferir que sea hoy ni marcar
  progreso real. Itinerario conserva bloques de hasta siete fechas; elegir una
  jornada abre su vista de consulta. Diario se organiza por fecha real.
- Alojamiento y su estado, y abastecimiento, se muestran abiertos. Traslados,
  dificultad y distancia mantienen etiquetas claras; presupuesto, plan B y
  procedencia pueden tener detalle desplegable. Sin datos se indica Por definir
  o Sin registrar; nunca se transforma un valor desconocido en cero.
- La foto de paisaje es decorativa y opcional. La interfaz debe conservar su
  jerarquía sin ella. Ensayar una altura breve, orientativamente 64–88 px en móvil
  y 100–140 px en escritorio, para que no desplace la información operativa.
- Anterior y Siguiente jornada navegan; Anotar jornada abre el formulario.
  Guardar en este dispositivo es una acción separada y confirma solo después
  de la transacción. La navegación nunca implica guardado ni sincronización.
- El formulario conserva borrador, errores y distinción entre kilómetros sin
  registrar y cero. En escritorio limita su ancho para lectura; en móvil usa
  una columna y mantiene guardar accesible sin tapar el campo de escritura.
- Mi copia o Ajustes reúne exportar, restaurar y comprobar preparación offline.
  Restaurar conserva su revisión y advertencia de reemplazo. No usar sincronizado
  para una copia local ni presentar una conexión de red como prueba de respaldo.

Estas decisiones de composición no representan un estudio de usuarios. La
implementación incluye tema oscuro, foco al seleccionar una jornada desde el
índice móvil, controles de al menos 44 px y respeto por movimiento reducido.
La imagen panorámica es un recurso generado de paisaje ficticio, decorativo y
prescindible; no representa el itinerario ni unas coordenadas reales.

Verificación histórica de esta entrega visual: formato, lint, tipos, 23 pruebas de dominio
y almacenamiento, compilación sin advertencias y 9 recorridos en Edge. Se revisó
el diseño a 320, 390, 736, 1024 y 1440 px en claro y oscuro, con movimiento reducido,
selección por teclado y sin desbordamiento horizontal. Los recorridos comprueban
también borradores, exportación/restauración, diario por fecha y escritura sin red.
La prueba de eventos de instalación es simulada; no sustituye una instalación física.
Los resultados y pendientes actuales se mantienen en el [backlog](backlog.md).

### Formato y forma de probarlo

La recomendación de esta revisión es conservar Angular y ofrecer la misma
aplicación como web responsive y PWA instalable. El manifiesto ya declara
standalone y existe Angular Service Worker, activo fuera del modo desarrollo.
Los iconos PNG de instalación de 192 y 512 px y el SVG están incluidos. Mi copia
ofrece instalar cuando el navegador permite mostrar su diálogo; de lo contrario
muestra instrucciones. Rechazar el diálogo no se presenta como instalación
completada. Falta ensayar el flujo en Android físico antes de afirmarlo para ese equipo.

En PC, build y preview desde frontend permiten revisar la versión implementada
en localhost:4200. El servidor de preview escucha solo en loopback: no ofrece
acceso al teléfono por la red local. El modo desarrollo no comprueba el caché PWA.
Para acceso habitual entre dispositivos se propone un origen HTTPS privado y
estable, conforme a la [guía de despliegue](despliegue.md). Cambiar de origen o
pasar a un contenedor nativo exige conservar y trasladar los datos de forma explícita.

Un APK mediante TWA o Capacitor queda como opción posterior. TWA vincula un sitio
HTTPS con una aplicación Android; Capacitor añade un proyecto nativo y permite
integrar plugins. Ninguno se ha instalado ni empaquetado para Routale. La decisión
se revisará si hacen falta funciones nativas o distribución en una tienda.

Instalar la PWA no conecta los datos entre PC y móvil. La API de copias privadas
está integrada en Mi copia mediante acciones explícitas de guardado y recuperación.
Alojar solo el frontend en Linux tampoco realiza esa integración ni constituye
un respaldo del diario local.

Fuentes consultadas: [instalación PWA, MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable),
[criterios de instalación, web.dev](https://web.dev/articles/install-criteria),
[Trusted Web Activity, Chrome](https://developer.chrome.com/docs/android/trusted-web-activity)
y [Capacitor](https://capacitorjs.com/docs).

## Registro de la dirección anterior implementada

Las secciones siguientes describen la entrega anterior como registro histórico.
Sus reglas de datos, accesibilidad y transacciones siguen vigentes; su paleta y
composición han sido sustituidas por la dirección de arriba.

## Objetivo

Mantener la distribución del itinerario, sus bloques de siete jornadas y el
detalle desplegable. Dar más personalidad al producto sin aumentar la cantidad
de paneles ni dificultar la lectura en un teléfono.

La revisión de la demo en escritorio y móvil muestra muchas superficies con
bordes, radios y fondos similares. La propuesta busca distinguir mejor el viaje,
las jornadas y las herramientas auxiliares mediante estilo y jerarquía.

## Referencias y uso propuesto

Estas referencias orientan decisiones; no se copiarán marcas, imágenes ni código.
Las funciones descritas por sus fabricantes no equivalen a pruebas de usabilidad
propias ni a funciones implementadas en Routale.

| Referencia                                     | Qué estudiar                     | Aplicación propuesta                                                                |
| ---------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| [Day One](https://dayoneapp.com/)              | Diario y lectura de entradas     | Dar protagonismo al texto y a la fecha; mantener controles secundarios discretos.   |
| [Polarsteps](https://www.polarsteps.com/)      | Recorrido, etapas y recuerdos    | Explorar un hilo de ruta y marcadores de jornada como elementos de identidad.       |
| [Wanderlog](https://wanderlog.com/plan-a-trip) | Itinerario por días y categorías | Distinguir alojamiento, transporte y provisiones con etiquetas e iconos coherentes. |

## Propuesta: cuaderno de ruta contemporáneo

- Fondo marfil suave, superficies claras, texto oscuro y acento verde bosque.
  Terracota en detalles de marca; errores y avisos conservan colores y etiquetas
  propios. Ningún significado depende únicamente del color.
- Explorar una tipografía con remates solo en el título del viaje y encabezados
  del diario. Mantener una tipografía sencilla en controles, fechas y cifras.
  Cualquier fuente adicional debe distribuirse localmente con su licencia.
- Un hilo fino con marcadores puede conectar visualmente las jornadas. Representa
  su orden; no es un mapa ni una afirmación sobre el recorrido geográfico.
- Reducir bordes y sombras repetidos. Usar separación y contraste de superficie
  para distinguir el detalle abierto de los días cerrados.
- Iconos de una misma familia, acompañados por texto cuando sean acciones.
- Transiciones breves al abrir una jornada o pulsar un botón, respetando movimiento
  reducido y sin retrasar la acción. Mantener foco visible y controles de 44 px.
- Fotografías opcionales en una futura portada o entrada; la interfaz debe seguir
  funcionando y conservar su identidad cuando no haya fotos.

## Primera prueba implementada

- Paleta marfil, verde bosque y terracota mediante tokens compartidos, con variante
  oscura. Bordes más discretos y sombra ligera en las superficies principales.
- Tipografía de sistema Georgia en marca, encabezados, cifras de resumen y notas
  del diario. Los controles mantienen la tipografía de interfaz; no hay descarga
  de fuentes ni nuevas dependencias.
- Marcadores numerados e hilo vertical en las jornadas; jornada seleccionada
  diferenciada también por marcador y borde. El hilo solo expresa el orden.
- Anillos decorativos discretos en el resumen, sin imagen externa ni significado
  geográfico. Paneles auxiliares con menor contraste que el itinerario.
- Logística separada mediante líneas; diario destacado como superficie de lectura.
- Entrada breve por opacidad del detalle y respuesta del botón principal. Movimiento
  reducido desactiva ambos efectos. Las acciones y el almacenamiento se conservan.

Verificación local: compilación, formato, lint y tipos aprobados; 17 pruebas de
dominio/almacenamiento y los 6 recorridos de navegador existentes aprobados en
Edge. Se comprobó además la demo y el formulario a 320, 390, 736, 1024 y 1440 px
en claro y oscuro, sin desbordamiento horizontal y con movimiento reducido.
Estas comprobaciones no equivalen a una prueba física de Android ni a una nueva
ejecución de CI remoto.

## Continuidad

La revisión visual queda cerrada para esta entrega. Reutilizar los tokens y la
jerarquía aprobada en las siguientes pantallas. Fotografías e iconografía adicional
permanecen como ideas; no son requisitos para continuar con las funciones.
