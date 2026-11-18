# Guía para cambios futuros

## Listados e historiales

Antes de crear o ampliar una pantalla que pueda acumular registros con el tiempo, revisá cuántas filas consulta y cuántas envía al navegador.

- Limitá la consulta en el servidor y paginá (50 registros por página como punto de partida). Un filtro visual sobre un arreglo completo no reemplaza la paginación de la base.
- Ofrecé filtros por fecha o período y navegación entre períodos cuando corresponda.
- Calculá totales con consultas agregadas en la base. No descargues todos los registros para sumarlos en el navegador.
- Cargá los detalles y catálogos pesados solo cuando el usuario abre la acción que los necesita.
- Agregá índices para filtros y ordenamientos frecuentes, y verificá el listado con un volumen representativo de datos.
- Conservá fecha y hora de los eventos que requieren trazabilidad y mostralas en la zona horaria apropiada.
