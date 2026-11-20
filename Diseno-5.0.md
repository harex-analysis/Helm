# DeckLab Desktop 5.0

## Lo que aporta la referencia

Balatro se desarrolló en Lua con LÖVE. En el tráiler se ve cómo el movimiento concentra la atención en la carta que se juega, el valor que sube y el resultado de la combinación. El fondo tiene vida con un ritmo propio. Para DeckLab, el equivalente es seguir la carta que entra al mazo, comprobar qué métricas cambian y leer la resolución del combate en el tablero. [Cronología de LocalThunk](https://localthunk.com/blog/balatro-timeline-3aarh) · [LÖVE](https://love2d.org/) · [Tráiler y demostraciones de Balatro](https://store.steampowered.com/app/2379780/Balatro/)

Square Enix describe el HD-2D de Octopath Traveler como la combinación de sprites 2D expresivos con un escenario que aporta profundidad y contraste. En DeckLab, la luz del tablero y los retratos en píxeles cumplen esa función con capas 2D. Los menús, las fichas y las cartas mantienen su lectura habitual. [Square Enix](https://www.square-enix-games.com/en_US/news/octopath-traveler-i-and-ii-now-available-current-console-platforms)

Busqué bibliotecas gratuitas de personajes. OpenGameArt tiene piratas genéricos bajo licencias abiertas y la sección de One Piece de SimplePixelArt tenía seis resultados, con poca cobertura del elenco. Las hojas de esta versión se produjeron para la aplicación. [OpenGameArt](https://opengameart.org/content/monochrome-pirates) · [SimplePixelArt](https://simplepixelart.com/arts/one-piece)

## Cómo se siente al jugar

| Flujo | Respuesta |
| --- | --- |
| Construir | La carta se inclina con el puntero. Al añadirla o sustituirla viaja entre la galería y la lista. Su contador reacciona y completar 50 tiene un pulso breve. |
| Repartir | **Mano de prueba** reparte cinco cartas naturales de tu lista. Permite un mulligan por tirada y alternar entre uno y dos DON!! para ver personajes aptos por coste impreso en esas mismas cinco cartas. |
| Optimizar | Cinco cartas se cruzan durante el cálculo. El perfil elegido, sus conteos y sus barras aparecen escalonados. **Repartir mano de la variante** permite probar una propuesta desde su menú. |
| Arena | Entran las cartas nuevas de la mano. Los combatientes se desplazan al atacar y aparecen señales breves de despliegue, bloqueo e impacto que siguen la resolución del motor. |
| Laboratorio | Las cartas jugadas entran al avanzar cada turno y se destacan los recursos del fotograma elegido. |

Los sonidos de cartas y combate se activan en **Ajustes**. Los vuelos, escalados y partículas respetan la preferencia de movimiento reducido. Las transiciones te permiten actuar mientras se reproducen. Los cálculos mantienen las reglas y los métodos descritos en la [auditoría técnica](Auditoria-4.0.md).

## Código y sprites

Fengari ejecuta el guion Lua incluido al arrancar. Lua calcula el ritmo, la posición y la rotación del barajado y parametriza vuelos, reparto, golpes, sonidos y partículas. Canvas dibuja los sprites y la capa de partículas. Electron aloja la ventana, el catálogo y los cálculos. El motor de Arena sigue emitiendo los eventos de la jugada y HiGHS entrega los resultados que aparecen en pantalla.

Las dos hojas contienen 24 personajes de cuerpo entero. La asociación por nombre cubre 443 códigos de líder o personaje del catálogo de 2.969 fichas. Las demás fichas muestran un retrato pixelado a partir de su carta cuando el arte está disponible y un marcador de color cuando falta el recurso. Las hojas tienen una pose por personaje. El desplazamiento, el despliegue y las reacciones se animan en ejecución.

### Cómo se generaron las hojas

Se utilizó la herramienta integrada de ImageGen con fondo transparente. Hojas finales en `src/ui/assets/crew-sprites.png` y `src/ui/assets/crew-sprites-rivals.png`.

<details>
<summary>Prompts de las dos hojas</summary>

```text
Use case: stylized-concept. Asset type: a single transparent 2D pixel-art sprite atlas for an original nautical card laboratory. Exactly 12 full-body character sprites in a rigid 4-column by 3-row regular grid, one distinct centered isolated silhouette per cell, evenly spaced with big fully transparent clear gutters and absolutely nothing connecting the cells. Use one consistent advanced 32-bit hand-placed pixel art style: stepped contours, deliberate square clusters, cloth with deep RPG shadow ramps and warm rim light, attractive miniature readable at 42–74 pixels, heroic body proportions, 3/4 side view facing left, a battle-ready idle pose, full heads and feet, no floor or scenery. Draw new poses and original cloth/styling, without tracing or using assets from any games, no 3D, no isometric boxes, no big-headed toy voxel blocks. No text, labels, watermarks, borders, frames, or panels. Transparent, including the spacing. In exact grid order:
Row 1: straw-hatted black-haired cheerful rubber pirate captain, scarlet shirt and cropped denim; red-haired sword captain in a sweeping black cape, white shirt; massive horned blue-black-haired warlord with purple cloak and studded club; long spiky black-haired ambitious captain, black cape, teal-red coat and sword.
Row 2: blond man in blue high-collar coat with black top hat, holding a metal pipe; pale blond lightning god with long ears, white head scarf and round thunder drums; young black-haired fire pirate with orange broad-brimmed hat, open red vest and tiny amber flame; fearsome broad black-bearded captain in bold burgundy pirate coat and gold sash.
Row 3: green-haired sword fighter in green waist wrap with sheathed swords; dark-haired woman in an indigo coat holding a small violet flower; curly orange-haired navigator with blue weather staff and cream blouse; stout small reindeer medic with pink hat and blue backpack.
Sprites only, exact rows and columns, keep legs and hats inside each tile with 15% transparent margin.

Use case: stylized-concept. Create one production transparent 2D pixel-art atlas of twelve original new pirate anime character poses for a nautical card lab. Exactly 4 equal columns and 3 equal rows, each cell centered with 10–14% transparent margins. Strictly transparent gutters all the way through. 32-bit RPG style, expressive side-facing full-body sprites, facing left, visible low-resolution pixel clusters, fine palette ramps with warm golden rim light, grounded fighter poses readable at 70px, consistent body rendering with varied sizes by character. No 3D, no voxels, no gradients on background, no labels, no writing, no floor or cast shadows. All feet, clothes, weapons and heads fit inside their own cell. Do not use or trace any existing game's assets. Ordered exactly:
Row 1: Charlotte Linlin, towering large intimidating pink-haired pirate matriarch in rose coat with ornate pink tricorn and a candy-red sword; Edward Newgate, mighty white-mustached old captain with white captain coat, red lining, giant polearm held close; Buckin, very short thin older woman with round sunglasses, fur-trim lavender coat and walking cane; Kyo, thin top-heavy black pompadour nautical brawler in rugged brown open coat with sea green sash.
Row 2: Queen, large blond braided cyber pirate with small round glasses, cobalt striped dungarees and mechanical left arm; King, tall masked black armoured winged sword wielder with a small orange ember by his shoulders, wings folded; Yamato, white-haired horned hero with teal hair tips, cream sleeveless kimono, red sash and dark club; Trafalgar Law, lean tattooed pirate with broad white spotted fur cap, dark blue gold-trim coat and sheathed long blade.
Row 3: Kouzuki Oden, huge smiling samurai with dramatic black topknot and orange robe, twin sheathed blades; Gloriosa, young confident black-haired pirate in orange-bronze flowered robe with a narrow snake curling over her shoulder; Shiki, wild golden lion-haired pirate with yellow lower robes and two slender blades close to body; Nola, a single large cobalt-and-silver sky serpent coiled compactly with a long upright head and no rider. No text, numbers or logos.
```

</details>
