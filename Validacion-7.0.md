# Validación de Helm 7.0

## Catálogo al 20 de noviembre de 2026

| Comprobación | Resultado |
| --- | --- |
| Fichas únicas | 2.969 |
| Cartas y líderes elegibles al corte Standard | 2.031 |
| Fichas excluidas con disponibilidad o construcción pendiente | 79 |
| Ilustraciones locales con ficha y formato de imagen válidos | 137 |
| Listas de ejemplo legales | 7 de 7 |
| Referencias de torneos legales en el catálogo incluido | 48 de 48 |
| Descargas de Bandai verificadas en muestra | 12 de 12 |

Electron cargó y decodificó ilustraciones de P-053 y OP16-034 en un perfil limpio. La de P-053 reemplazó un archivo de caché incompleto. El alcance de la muestra describe las descargas comprobadas durante la auditoría. [Catálogo de Bandai](https://en.onepiece-cardgame.com/cardlist/) · [Bloques y excepciones](https://en.onepiece-cardgame.com/news/blockicon-card.html)

## Optimización y métricas

- Comprobé 15 listas reales con el mismo flujo de recomendación que usa el botón. Las 43 propuestas conservaron legalidad, 50 cartas y las cantidades al exportarlas y volverlas a importar. HiGHS cerró la brecha del modelo en las 43 propuestas. El mayor error al recalcular la función objetivo con las copias propuestas fue inferior a 5 × 10⁻¹¹ puntos.
- Con la búsqueda abierta, los planes principales propusieron entre 26 y 48 copias nuevas. El jugador puede limitar ese alcance después del primer resultado o conservar la estructura de su lista.
- La salida exacta cuenta la probabilidad de robar un personaje de coste jugable con una mano natural. Para contrastarla, corrí 3.000 ensayos por lista y orden con la misma semilla. La mayor diferencia entre estimación y cálculo exacto fue de 2,00 puntos porcentuales en esa muestra.
- El Counter impreso es un recuento de copias. El Counter en mano tras el turno 3 es una estimación dependiente de los despliegues de la práctica. La pantalla muestra los dos resultados con sus etiquetas correspondientes.
- La prueba independiente con un mazo reducido compara HiGHS con la enumeración de sustituciones. Las pruebas de Helm prueban también el mínimo por carta, el bloqueo de cantidades, el mínimo impreso de Counter y la opción de conservar el mazo con cero cambios.

La brecha mide qué tan cerca quedó la solución de la mejor puntuación del modelo. El rendimiento en torneos se evalúa por separado con partidas observadas. Las interacciones complejas de cartas que todavía requieren interpretación se pueden resolver en la mesa de efectos de la Arena.


## Paquete de Windows

Las 24 pruebas de motor y datos pasaron desde una copia limpia del código. Ejecuté el instalador NSIS de Windows x64 en una carpeta temporal. La aplicación instalada completó las pruebas de líder y arrastre, sugerencia, ajustes posteriores, optimización, animaciones, Arena, importación, exportación y persistencia. También verifiqué la desinstalación de la copia de prueba.

La beta se distribuye con un SHA-256 y sin firma digital. La auditoría de npm reportó cero avisos para las dependencias de ejecución de Node y seis moderados en dependencias de desarrollo de las herramientas de empaquetado.
