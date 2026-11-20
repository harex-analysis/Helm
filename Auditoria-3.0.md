# Auditoría de DeckLab 3.0

## Qué se observó al jugar

| Fuente revisada | Observación | Decisión en la app |
| --- | --- | --- |
| Tutorial de Bandai, 5:54 y 9:54 | Al inicio se distinguen refresco, robo, DON!! y fase principal. Durante el ataque, el tutorial identifica la carta y el valor de Counter antes de resolver. | La franja superior muestra el paso vigente. Bloqueo, Counter y daño se destacan solo al entrar en combate. [Fases y DON!!](https://www.youtube.com/watch?v=s8s7vSSb8Tk&t=354s) · [Counter](https://www.youtube.com/watch?v=s8s7vSSb8Tk&t=594s) |
| Enel contra Rocks, 2:39 | El jugador reserva un Counter de +2000 para detener un ataque marcado como Double Attack. El DON!! del atacante ya estaba asignado. | Se muestran poder de ataque y defensa, DON!! asignado por unidad y los Counter utilizables. Durante la defensa se puede tocar la carta en la mano. [Partida comentada](https://www.youtube.com/watch?v=DPD0OHPgIeI&t=159s) |
| Rocks contra Kaido, torneo EB05, 3:20 | La Vida queda al lado del campo y los mazos se distinguen de la mano. Cada jugador reconoce las cartas por su ilustración y posición. | Las dos mitades tienen Vida, cinco lugares de personaje, líder, escenario, coste, mazo, descarte y mazo DON!!. Los retratos se obtienen por el código exacto de la carta. [Partida física](https://www.youtube.com/watch?v=fuNfzI7hCyE&t=200s) · [Tapete oficial](https://en.onepiece-cardgame.com/pdf/playsheet.pdf?20250929) |

En conversaciones de la comunidad aparecieron dos preferencias de tapete. Algunos jugadores usan zonas visibles para orientarse y otros priorizan que se vea la ilustración. También hay comentarios que valoran la economía predecible de DON!! y señalan problemas cuando sus fichas tapan al líder en un simulador. Son testimonios cualitativos. El diseño usa separadores discretos y deja el área de coste fuera de los retratos. [Tapetes](https://www.reddit.com/r/OnePieceTCG/comments/1s6of7o/playmats/) · [Qué les gusta del juego](https://www.reddit.com/r/OnePieceTCG/comments/1r280qt/what_are_some_reasons_why_you_love_this_game/) · [Comentarios sobre un simulador](https://www.reddit.com/r/OnePieceTCG/comments/1v17vdz/i_keep_improving_my_free_optcg_practice_sim_and/)

## Revisión de la interfaz

| Hallazgo de la revisión | Cambio |
| --- | --- |
| Siete destinos principales competían por atención. | Mesa, Optimización y Arena forman el recorrido principal. Laboratorio, Catálogo, Biblioteca y Partidas están en **Herramientas**. |
| Exportar, guardar y editar ocupaban espacio junto a las jugadas de mayor prioridad. | El menú **Mi lista** reúne las acciones de archivo. En la mesa, generar o reparar se muestra según el estado del mazo. |
| Los mismos sprites representaban cartas distintas. | El retrato de cada unidad es un encuadre del arte oficial enlazado a su código. El nombre, poder y estado se leen debajo. El panel de ficha muestra la carta completa. [Catálogo de Bandai](https://en.onepiece-cardgame.com/cardlist/) |
| Los recursos y la lectura del ataque exigían saltar entre paneles. | El tapete muestra DON!! activo, descansado, asignado y en reserva. Las selecciones de ataque y defensa se destacan donde ocurren. Los costes de devolución dejan elegir la procedencia del DON!!. |
| La bitácora y los controles de depuración distraían del turno. | Quedan visibles la decisión actual y el último evento. La bitácora completa, la semilla y la mesa de efectos se pueden abrir cuando hacen falta. |
| Un puntaje único reunía prioridades distintas. | **Evidencia** muestra probabilidades e intervalos en unidades de juego, con un desglose del puntaje bajo demanda. Si el Counter del turno 3 baja con evidencia en alguno de los órdenes, la propuesta lo indica. |

El fondo original está en `src/ui/assets/sea-chart.png` y fue generado con la herramienta integrada de imágenes. La dirección visual pidió una carta náutica nocturna en formato panorámico, con grabado azul petróleo, líneas cartográficas turquesa, una rosa de los vientos de latón, islas en los márgenes y espacio de bajo contraste debajo de las cartas.

Las ilustraciones de las siete listas de ejemplo se incluyen para practicar sin conexión. El catálogo utiliza caché local al consultar el arte de otros códigos.

## Auditoría matemática

**Factibilidad.** Cada cantidad es una variable entera. Se exige que la suma sea 50, con límites por código, posesión, cartas fijadas, parejas prohibidas y máximo de entradas. Al ajustar una lista legal también se conserva la estructura por tipo y se acota la pérdida del rasgo dominante. Después de resolver, otro paso verifica las cantidades, las reglas y los mínimos. El programa recalcula el objetivo a partir de las copias y descarta la discrepancia numérica como error de comprobación. **Óptima para el modelo** indica el estado de HiGHS con las tolerancias configuradas. Los demás estados aceptados se etiquetan como factibles cuando pasan las comprobaciones. [Opciones de HiGHS](https://ergo-code.github.io/HiGHS/dev/options/definitions/)

**Salida y Counter como probabilidades.** Con `K` copias elegibles, `m` robos naturales y 50 cartas, la probabilidad de ver al menos una es `1 − C(50−K,m)/C(50,m)`. La salida primero usa cinco cartas y Personajes de coste 0–1. La salida segundo usa seis cartas y Personajes de coste 0–2. Counter +2000 en la mano natural usa cinco. Al insertar más copias, el incremento en probabilidad disminuye. Las rectas entre conteos consecutivos forman una envolvente que coincide con la probabilidad en cada conteo entero. HiGHS la usa directamente en el puntaje. Las demás señales incluyen afinidad, interacción, objetivos, densidad de piezas y penalización por cambios. Sus pesos expresan el perfil de búsqueda.

**Medición fuera del objetivo.** El Laboratorio reporta por separado el Counter que realmente queda en mano a turno 3 bajo una política de despliegue por coste impreso. Cada par parte de semillas y posiciones compartidas. La diferencia por ensayo vale −1, 0 o +1 y su intervalo por métrica usa una cota bilateral conservadora de Bernstein empírica. La vista usa mano natural, sin mulligan. Un intervalo que incluye cero aparece como no concluyente. Las decisiones de rivales humanos, los metajuegos y el porcentaje de victorias requieren datos de partidas y otras validaciones. [Maurer y Pontil](https://arxiv.org/abs/0907.3740)

## Resultados medidos

Se probaron siete listas de ejemplo y ocho listas de torneo con líderes adicionales para el 19/11/2026. Se revalidaron y reimportaron **35 propuestas**. Las 35 obtuvieron estado óptimo del modelo. La mayor diferencia absoluta entre el objetivo devuelto y el recalculado fue menor de 0,000002 puntos. Para la primera propuesta de cada lista se ejecutaron 3.000 ensayos por orden con semilla 916407. La mayor diferencia entre la probabilidad exacta de salida y la tasa simulada fue de 2,25 puntos porcentuales al redondear.

| Lista | Personaje jugable T1 al ir primero, exacto | Counter +2000 en mano T3 al ir primero, simulado |
| --- | ---: | ---: |
| Rocks.D.Xebec | 59,9 % → 72,8 % | 0,0 % → 10,1 % |
| Shanks | 59,9 % → 86,9 % | 47,9 % → 37,4 % |
| Kaido | 59,9 % → 84,7 % | 7,0 % → 8,7 % |
| Nico Robin, torneo adicional | 54,6 % → 84,7 % | 62,2 % → 58,5 % |

Las 15 primeras propuestas aumentaron la opción exacta de jugar un personaje al ir primero en esta muestra. El Counter restante al ir primero mejoró en ocho listas con un intervalo por encima de cero, cayó en tres y quedó no concluyente en cuatro. Shanks y Nico Robin ilustran por qué conviene leer ambas medidas antes de aplicar la propuesta.

El archivo `test-output/benchmark-3.0.json` contiene los resultados por líder, enlaces a los eventos, tamaños de muestra e intervalos. Para reproducirlo, ejecuta `npm run benchmark` desde la carpeta de DeckLab Desktop. Las pruebas automáticas también comparan el resultado del solver con una enumeración independiente de un caso pequeño.
