# Dirección visual de Bitácora

Estado: estilo aprobado por el usuario y aplicado a la aplicación local.
Conservar esta dirección al desarrollar las siguientes funciones.

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
propias ni a funciones implementadas en Bitácora.

| Referencia | Qué estudiar | Aplicación propuesta |
| --- | --- | --- |
| [Day One](https://dayoneapp.com/) | Diario y lectura de entradas | Dar protagonismo al texto y a la fecha; mantener controles secundarios discretos. |
| [Polarsteps](https://www.polarsteps.com/) | Recorrido, etapas y recuerdos | Explorar un hilo de ruta y marcadores de jornada como elementos de identidad. |
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
