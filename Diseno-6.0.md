# DeckLab Desktop 6.0

## Qué cambia para un jugador

| En el recorrido | Decisión de diseño |
| --- | --- |
| Elegir un líder y revisar opciones | La zona del líder acepta arrastrar y soltar incluso después de pulsar **Cambiar**. El mazo anterior queda en la Biblioteca. La Mesa y el Catálogo añaden cartas al bajar y conservan el acceso directo por búsqueda y filtros. |
| Elegir qué intenta mejorar el optimizador | El número de copias, el mínimo de Counter y el orden figuran juntos encima de **Calcular propuestas**. Los objetivos, el rival y el uso de sinergias se pueden abrir en el mismo lugar. |
| Decidir si vale la pena aplicar un cambio | Primero ves qué cambia en turno 1 y en defensa en mano al turno 3 para el orden elegido. Debajo puedes probar la propuesta y revisar qué cartas entran y salen. Los intervalos, ensayos y detalles de HiGHS están en **Evidencia**. |
| Entender una sinergia | Cada ficha empieza por la carta que activa el efecto y cuándo ocurre. Luego muestra ejemplos de objetivos reales, cuántas copias hay y la probabilidad de acertar cuando el efecto es una búsqueda. |
| Practicar un duelo | La escena de un despliegue, ataque, defensa o impacto dura lo suficiente para distinguir el evento. El tablero y la mano mantienen sus controles activos durante la escena. |

Mi criterio para practicar un mazo competitivo sería escoger primero el orden en que se quiere poner a prueba. Luego compararía la salida y el Counter en mano en ese orden, revisaría los buscadores que ganan o pierden objetivos y llevaría solo las variantes prometedoras a la Arena. Un resultado incierto de defensa o una caída de consistencia en un buscador importante merece pruebas de mesa aun cuando el objetivo matemático mejore. [Auditoría matemática](Auditoria-4.0.md)

## Referencias visuales y de interacción

En *One Piece Odyssey*, Bandai muestra los recursos de combate junto a las acciones y reserva un momento visual para resaltar eventos durante el turno. En *Pirate Warriors 4*, el golpe se reconoce por la entrada del personaje y el énfasis de la acción. El diseño de DeckLab toma la idea de un evento legible y la adapta a un tablero de TCG con sus zonas y recursos a la vista. La interfaz combina papel cálido, madera, rojo y amarillo paja. Los sprites de la Arena se dibujan en una capa iluminada sobre el tablero. [Guía de Odyssey](https://en.bandainamcoent.eu/one-piece/news/one-piece-odyssey-starter-guide-tips-know-playing-the-game) · [Tráiler de Pirate Warriors 4](https://en.bandainamcoent.eu/one-piece/news/first-gameplay-trailer-one-piece-pirate-warriors-4) · [Manual del TCG](https://en.onepiece-cardgame.com/pdf/rule_manual.pdf)

Los efectos pequeños de la versión anterior iban dentro del tablero. Una actualización de la interfaz podía retirar ese elemento antes de que la animación terminara. La Arena ahora dibuja las escenas de combate en una capa estable y conserva su posición cuando el tablero cambia. **Animación** y sonido están a la vista en Arena. Se puede elegir entre escenas completas, breves, movimiento reducido o la preferencia de Windows.

## Personajes nuevos

Se añadieron Boa Hancock, Buggy, Hatchan, Leo, Otama, Vivi, Boa Sandersonia, Jinbe, Imu, Sanji, Usopp y Bepo. Hay **36 personajes de cuerpo entero** asignados a **604 códigos** del catálogo inicial. Las demás cartas usan un retrato pixelado de su propia ilustración cuando está disponible.

La tercera hoja se generó con ImageGen integrado y se guardó en `src/ui/assets/crew-sprites-grand-line.png`. El motor limpia píxeles de baja opacidad del borde al dibujar el sprite.

<details>
<summary>Prompt de la tercera hoja</summary>

```text
Produce one transparent 2D pixel-art sprite atlas for an original nautical RPG card practice game, an added roster of 12 original poses in a STRICT 4-column x 3-row equal square tile grid. Authentic expressive 32-bit JRPG pixel art with visible pixel clusters, warm rim light, deep shadow ramps, body proportions with expressive small heads, readable when shrunk to 72 pixels. Facing toward the left in three-quarter side view. Entire silhouette including head, weapon and toes visible, keep each character strictly within the middle 75% of its tile in each axis and leave wider transparent gutters than usual, absolutely no crossing between cells. No canvas backgrounds, no scenery, no floor, no writing, no logos, no 3D, no toy blocks. Create the poses from these anime character concepts with original styling and framing, without tracing sprites or using assets from any game. In this exact order. Row 1: Boa Hancock with long straight jet-black hair, gold earrings, wine-red and lilac dress, a small coiled white snake at her feet; Buggy with blue ponytail, bright scarlet clown nose, long amber-and-red pirate coat, a flamboyant captain pose; Hatchan with pale rose skin, octopus fish-man crossed twin blades, blue-violet head with star tattoo and multiple arms; Leo with green hood and small yellow outfit, tiny forest warrior holding a large needle. Row 2: Tama (Otama), cheerful small child with purple topknot, seed-green Japanese festival kimono, small orange satchel; Nefeltari Vivi, blue-haired princess in a cream traveling cape, gilded sash and pastel lilac skirt; Boa Sandersonia, tall lime-haired serpent pirate in emerald and warm coral, elongated curving snake-like tail; Jinbe, broad blue fishman in warm coral-orange kimono with deep navy sash in a karate pose. Row 3: Imu, elongated mysterious cloaked ruler, black and deep crimson robes with long crown and eerie violet eyes; Sanji, slender blond fighter with black suit and gold trim standing with his right knee lifted; Usopp, long nose and pale goggles, ochre overalls, crimson scarf, holding a big slingshot; Trafalgar’s ally Bepo, a standing white polar bear martial artist in an amber-orange flight suit, white paws. Exactly 12 isolated silhouettes, crisp stepped pixels with no blur. Transparent.
```

</details>
