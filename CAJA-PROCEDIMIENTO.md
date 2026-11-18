# Procedimiento de caja

Una caja física tiene un solo responsable activo. Cada persona ingresa con su usuario y no comparte credenciales.

## Configuración de sucursales y cajas

1. Administración abre **Panel de sucursal** y marca las funciones de cada local: depósito, punto de venta y/o mayorista. Un local puede combinar varias funciones; un depósito exclusivo no necesita caja.
2. Si el local se abastece desde un depósito, selecciona ese depósito. En **Mover stock**, al administrar ese local, el depósito queda propuesto como origen del traslado.
3. Define la cantidad de cajas físicas. Cada caja tiene un número, responsable, turnos, ventas, saldo y arqueo independientes. Los empleados eligen la caja que están usando antes de abrirla o cobrar.
4. Para reducir la cantidad de cajas, primero cierra y aprueba los turnos de las cajas que se desactivarán. El historial de esas cajas se conserva y puede reactivarlas más adelante.

## Apertura

1. El responsable cuenta el efectivo y carga **un único monto total**. No ve el saldo esperado ni si contó de más o de menos.
2. El sistema toma como fondo registrado de **esa caja** el saldo de su última acción informada: cierre, extracción o ingreso para cambio. Si el cierre anterior sigue pendiente de revisión, usa el importe contado como **saldo provisional**. En la primera apertura, el conteo establece el fondo inicial.
3. Si el conteo de apertura es menor al esperado, después de enviarlo el sistema pide al responsable un motivo obligatorio. El conteo enviado ya no puede editarlo.
4. Administración revisa las aperturas en la sección **Revisión de aperturas de caja** del Panel. Compara el importe, el saldo esperado y la diferencia; puede aprobar, rectificar el conteo con motivo o anular la apertura. Las rectificaciones y anulaciones quedan auditadas. La diferencia de apertura no reemplaza automáticamente el fondo esperado.

## Durante el turno

- Registrar cada venta, devolución, ingreso para cambio y extracción en el momento en que ocurre.
- Administración registra los ingresos para cambio con motivo y las extracciones con su clave. El responsable verifica físicamente cada entrega o retiro.
- El empleado ve los importes de las operaciones que realiza, pero no el saldo esperado, los acumulados de ventas ni las diferencias de arqueo.

## Cambio de responsable

1. El responsable saliente elige **Entregar caja**, cuenta el efectivo y envía un único monto. La caja se bloquea.
2. El responsable entrante ingresa con su usuario, vuelve a contar y confirma un único monto de recepción. Entonces queda habilitado para operar.
3. Administración ve ambos conteos, el saldo esperado y las diferencias. Puede cancelar un traspaso iniciado por error con un motivo.

## Cierre y revisión

1. El responsable elige **Contar y cerrar**. Mientras cuenta, no se permiten ventas ni movimientos.
2. Envía **un único monto total**. El sistema le confirma cuánto envió y ya no puede editarlo. Si el monto es menor al esperado, después del envío le exige un motivo; no le muestra el importe esperado ni la diferencia.
3. El cierre queda **pendiente de revisión**. El importe contado se utiliza de manera provisional para la siguiente apertura. Administración puede rectificarlo con un motivo y el fondo registrado de esa apertura se recalcula.
4. Administración revisa el cierre en la sección **Revisión de cierres de caja** del Panel, después de revisar su apertura. Puede aprobar, rectificar o anular el cierre. Cada acción queda auditada. Al aprobarlo, el ajuste pasa a ser permanente. Si lo anula, se descarta el conteo de ese cierre y se usa el saldo esperado registrado.
5. Con la caja cerrada y aprobada, administración puede registrar extracciones o ingresos para cambio. Cada acción cambia el saldo de la próxima apertura.

Si dos personas usan el mismo cajón, deben completar el traspaso antes de que la siguiente persona cobre. Así queda registrado quién era responsable en cada momento.
