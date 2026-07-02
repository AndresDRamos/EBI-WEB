# Layout y navegación del Portal

## Contexto

Este proyecto tiene la intención de tener todo el control posible, de la producción y distintas áreas operativas y administrativas existentes en EZI Metales.

## Objetivo

Brindar el mayor control desde el panel de administrador de la arquitectura y layout principal del control de esta página, todo desde el panel de administrador, qué secciones del topbar son esenciales según el usuario loggeado, por ejemplo, si soy de Calidad, quiero ver mi pestaña (en la que tendré mayores roles de usuario) primero a la izquierda, ver lo que me toca a mí, y sobre todo, tener bien claros mis alcances.

### Topbar

Poder crear desde el topbar, (o con migraciones, dado los módulos a crear), las distintas secciones o sub-secciones de las partes administrativas de EZI, como por ejemplo: Mantenimiento, Calidad, Producción, Finanzas, Cadena de suministro, Capital humano.

### Sidebar

Tener para cada sección seleccionada, un sidebar dinámico con las opciones y sub-secciones del mismo disponibles para cada sección, por ejemplo, para mantenimiento pudiéramos tener:

- Equipos
- Mantenimientos correctivos
- Mantenimientos preventivo
- Mantenimientos autónomos
- Personal técnico

etc.

## Diseño

hacer un diseño fiel al branding de la empresa, pero también moderno, con animaciones simples pero elegantes. Algo que quiero implementar es un sidebar que, muestre los íconos de cada sección (también configurables) a la izquierda, y el mismo tras quitar el mouse encima del sidebar, éste colapse y sólo queden visibles los íconos de cada página, sin saltos, ni re-ajustes. Y dejar un icono tipo “pinn” en la parte superior derecha que permita al sidebar dejar de colapsarse, hasta que el usuario vuelva a quitar ese pinn. (Mantener en caché la decisión por usuario)

Priorizar siempre que el contenido principal no tenga scroll a medida de lo posible (los scroll deberán estar en los componentes que el contenido principal renderice).

Reta mis ideas, propón la mejor estructura y diseño para esta interfaz.