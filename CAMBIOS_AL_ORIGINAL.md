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

> ⚠️ **Este PC es el de la iglesia** (el mismo donde corre ProPresenter). Reglas:
> - Nunca usar la DeckLink mientras ProPresenter esté abierto. Preguntar antes de cada prueba de salida.
> - No cambiar nada en Blackmagic Desktop Video Setup.
> - No tocar ni desinstalar ProPresenter.

- **Tarjeta:** Blackmagic DeckLink Duo 2
- **Conectores:** los 4 configurados como **salida**
- **Modo de video:** **1080i59.94** en los 4 mientras ProPresenter los usa. En reposo muestran **NTSC**, y eso es normal.
- **Driver:** Blackmagic Desktop Video, en `C:\Program Files\Blackmagic Design\Blackmagic Desktop Video\`. Versión del SDK (DeckLink API): **16.5.0**.

| Conector | Nombre en ProPresenter | Grupo | Lleva |
|---|---|---|---|
| SDI 1 | Background | Audiencia | Solo fondo |
| SDI 2 | Redes | Audiencia | Letra para transmisión |
| SDI 3 | STAGE | Escenario | Letra + hora |
| SDI 4 | Video | Audiencia | Letra + fondo |

### Lo que detecta FreeShow (2 de noviembre de 2026, solo lectura, sin enviar video, con ProPresenter cerrado)

| Índice | Nombre que muestra FreeShow | ID del dispositivo | Sub-dispositivo | ¿Ofrece 1080i59.94? |
|---|---|---|---|---|
| 0 | DeckLink Duo (1) | `81:0145bbf0:00000000` | 1 de 4 | Sí |
| 1 | DeckLink Duo (2) | `81:0145bbf1:00000000` | 2 de 4 | Sí |
| 2 | DeckLink Duo (3) | `81:0145bbf2:00000000` | 3 de 4 | Sí |
| 3 | DeckLink Duo (4) | `81:0145bbf3:00000000` | 4 de 4 | Sí |

Cada conector ofrece 16 modos de salida y los formatos 8/10-bit YUV, 8-bit ARGB/BGRA y RGB de 10/12 bits.

> Falta confirmar que "DeckLink Duo (1)" sea el conector físico **SDI 1**, y así con los demás. Se comprueba en la primera prueba de salida, con permiso y con ProPresenter cerrado.

**Falta anotar el día de la prueba,** con fotos de Desktop Video Setup y sin cambiar nada:

- [ ] Perfil de la Duo 2 (por ejemplo "4 half duplex")
- [ ] Formato de color que usa ProPresenter en cada conector
- [ ] Si el audio sale por SDI
