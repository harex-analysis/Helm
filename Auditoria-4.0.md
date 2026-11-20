# DeckLab Desktop 4.0

## Flujo de juego e interfaz

| Referencia | Qué vimos | Decisión en DeckLab |
| --- | --- | --- |
| [Sala](https://oplaytcg.com/play) y [constructor](https://oplaytcg.com/en/deck-builder) de OPlayTCG | El jugador equipa un mazo y elige el formato antes de jugar. El constructor pone al líder, la legalidad y los filtros a la vista. La partida en línea solicita una cuenta. | La Arena empieza con tu lista, el oponente y el orden. El selector está al alcance desde la sala y durante el duelo. La mesa mantiene arriba la lista y debajo las cartas elegibles. |
| [Guía de Bandai](https://tutorial.onepiece-cardgame.com/en), [video oficial](https://www.youtube.com/watch?v=s8s7vSSb8Tk) y [reglas completas](https://en.onepiece-cardgame.com/pdf/rule_comprehensive.pdf) | Las zonas separan líder, escenario, personajes, Vida, descarte, mazo y DON!!. El combate tiene ventanas de ataque, Blocker, Counter y daño. | El tablero identifica cada zona y la fase activa. Cada lado muestra sus recursos. En ventanas pequeñas se desplaza el tablero y la mano conserva su propio espacio. |
| [OPTCG AI](https://optcg.ai/en/), [OPLab](https://oplab.gg/) y [conversación sobre práctica individual](https://www.reddit.com/r/OnePieceTCG/comments/1ucr4o5/playing_solo_on_sim_for_practice/) | La práctica individual permite repetir enfrentamientos, estudiar la curva y probar el efecto de salir primero o segundo. Los filtros de coste y Counter ayudan a tomar decisiones sobre copias. | Las sugerencias de Arena señalan una situación para practicar. Cada propuesta muestra los dos órdenes con porcentajes y barras comparables. |

La paleta usa rojo, amarillo paja y azul marino. Las figuras de píxeles se proyectan a partir de volúmenes con piel, vestuario y accesorios por rol, color y código. Las cartas conservan el arte completo al lado de las figuras y el texto en su ficha. Despliegue, ataque, bloqueo y daño usan eventos del motor. La animación se reduce según la preferencia del sistema.

La elección del rival reutiliza los mazos legales de ejemplo, las versiones guardadas y las referencias de torneos. Si eliges un líder, puedes pedirle al motor un mazo de práctica de 50 cartas. Las sugerencias se basan en la composición del mazo y proponen ejercicios como probar respuestas ante aceleración de DON!! o costes elevados en mesa.

## Revisión matemática

- **Modelo de programación entera mixta.** Una variable entera por código fija la cantidad de copias. El problema exige 50 cartas. El conjunto y los límites de variables aplican reglas del líder y colección. Otras restricciones conservan copias fijadas, el máximo de cambios, las parejas prohibidas y el mínimo configurable de Counter +2000 impreso.
- **Probabilidad exacta.** Para una lista de 50 y una mano de tamaño *d*, la probabilidad de ver al menos una de *k* copias se obtiene restando al 100 % la probabilidad hipergeométrica de ver cero. En T1 se usan cinco cartas y personajes de coste 0–1 al salir primero, y seis cartas y coste 0–2 al salir segundo. Se mide una apertura natural. La interfaz avisa si el líder puede alterar la preparación.
- **Verificación de HiGHS.** Cada lista se vuelve a validar, se recalculan sus contribuciones y se comprueba el objetivo del solucionador. La cota superior acota el mejor puntaje posible. Una brecha MIP de 0 % certifica el óptimo para ese objetivo dentro de la tolerancia numérica. Los pesos de curva, respuestas y afinidad representan los criterios del modelo.
- **Ensayos emparejados.** Se fija el orden inicial de la lista base antes de barajar. Las copias compartidas conservan su posición y las entradas ocupan los lugares de las salidas. Cada par comparte semilla. Así, con el mismo experimento, la estimación base es idéntica al cambiar de variante. La diferencia de frecuencias muestra su intervalo de confianza empírico de Bernstein del 95 %.
- **Defensa.** Las copias impresas en el mazo son un conteo. El Counter +2000 disponible en mano al acabar T3 es una frecuencia de simulación condicionada por los despliegues. El Laboratorio permite probar la política de reservar Counter. Las métricas de Arena describen ese duelo y el historial recoge resultados registrados por el jugador.

## Resultados reproducibles

Se verificaron 15 listas legales, 35 variantes y 3.000 ensayos por orden para la primera variante de cada lista. Las 35 variantes fueron óptimas para sus objetivos según HiGHS con brecha MIP reportada de 0 %. El mayor error al recalcular el objetivo fue de 0,000001 puntos. La máxima diferencia observada entre la frecuencia simulada de despliegue T1 y su probabilidad exacta fue de 2,0 puntos porcentuales. [Resultados completos](test-output/benchmark-4.0.json)

En Shanks OP17-020, la variante equilibrada con ocho sustituciones elevó la salida natural de turno 1 al ir primero del 59,9 % al 86,9 %. La frecuencia de conservar Counter +2000 en mano a T3 bajó del 48,4 % al 38,1 %. La diferencia emparejada fue de −10,3 puntos porcentuales, con intervalo del 95 % entre −13,0 y −7,7. Subir la calidad de la salida y retener las defensas disponibles son objetivos con consecuencias distintas para las decisiones de juego.

Se ejecutaron las 21 pruebas de reglas, legalidad, simulación, combinaciones y optimización. Una prueba compara HiGHS con la enumeración de todas las sustituciones de un caso pequeño. Otra comprueba que la misma lista base arroja los mismos resultados sola y con una variante. La prueba de escritorio recorre la selección de rival, el generador, el despliegue, el combate, la optimización y el historial.

Al abrir un perfil de prueba con conexión, la mesa apareció mientras se consultaban las fuentes. La revisión guardó 2.969 cartas de Bandai y 135 referencias locales de torneo tras fusionar datos con Limitless. Si las restricciones cambian y requieren revisión, se conserva el último catálogo validado. Los efectos de cartas complejas que quedan por modelar se pueden resolver desde la Mesa de efectos.
