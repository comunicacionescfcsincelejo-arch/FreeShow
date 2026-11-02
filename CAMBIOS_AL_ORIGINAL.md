# Cambios al código original de FreeShow

Aquí se anota **cada archivo original de FreeShow que modifiquemos**, y por qué. Sirve para poder actualizar el fork cuando FreeShow saque versiones nuevas.

Base del fork: **FreeShow 1.6.8-beta.2** (commit `bed0f247`).

## Archivos originales modificados

| Fecha | Archivo | Rama | Qué se cambió | Por qué |
|---|---|---|---|---|
| — | *(ninguno todavía)* | — | — | — |

> Los archivos nuevos del proyecto no cuentan como cambios al original: `CLAUDE.md`, `INSTALAR_WINDOWS.md`, `AUDITORIA.md`, este archivo, los planes `*_PLAN.md` y todo lo que esté en `src/modulos/`.

## Arreglos fuera del repositorio

Estos se hacen dentro de `node_modules`, que no se guarda en Git, y hay que repetirlos tras cada `npm install`. Detalle en `INSTALAR_WINDOWS.md`, sección 3.

- Descarga manual de Electron (`node node_modules\electron\install.js`).
- Recompilar `@discordjs/opus` para Electron 45.

---

## Configuración de referencia de la DeckLink (PC de la iglesia)

Es la configuración **actual**, antes de cualquier cambio, para poder volver a ella. Viene de ProPresenter y de Blackmagic Desktop Video Setup.

- **Tarjeta:** Blackmagic DeckLink Duo 2
- **Conectores:** los 4 configurados como **salida**
- **Modo de video:** **1080i59.94** en los 4

| Conector | Nombre en ProPresenter | Grupo | Lleva |
|---|---|---|---|
| SDI 1 | Background | Audiencia | Solo fondo |
| SDI 2 | Redes | Audiencia | Letra para transmisión |
| SDI 3 | STAGE | Escenario | Letra + hora |
| SDI 4 | Video | Audiencia | Letra + fondo |

**Falta anotar el día de la prueba,** con fotos de Desktop Video Setup:

- [ ] Perfil de la Duo 2 (por ejemplo "4 half duplex")
- [ ] Formato de color por conector (por ejemplo 8-bit YUV)
- [ ] Versión del driver Desktop Video
- [ ] Si el audio sale por SDI
