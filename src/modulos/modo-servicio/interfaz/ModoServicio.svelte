<script lang="ts">
    import { onMount } from "svelte"
    import { MENSAJE_BLOQUEO, MENSAJE_CONFIRMAR } from "../logica"
    import { activarModoServicio, aplicar, iniciarModoServicioInterfaz, modoServicio, pasoAviso } from "./estado"

    onMount(iniciarModoServicioInterfaz)

    $: activo = $modoServicio.activo
    $: desde = $modoServicio.desde ? new Date($modoServicio.desde).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""

    function alPulsarIndicador() {
        if (activo) aplicar("pedir-desactivar")
        else activarModoServicio()
    }

    function teclas(e: KeyboardEvent) {
        if ($pasoAviso !== "oculto" && e.key === "Escape") aplicar("cancelar")
    }
</script>

<svelte:window on:keydown={teclas} />

{#if activo}
    <!-- marco rojo alrededor de toda la ventana: se ve desde lejos -->
    <div class="marco" aria-hidden="true" />
{/if}

<button class="indicador-modo-servicio" class:activo on:click={alPulsarIndicador} title={activo ? "Modo servicio activo: la ventana no se puede cerrar. Clic para desactivar." : "Activar modo servicio: protege las salidas contra un cierre accidental."}>
    {#if activo}
        <span class="punto" />
        MODO SERVICIO
        {#if desde}<span class="desde">desde {desde}</span>{/if}
    {:else}
        Activar modo servicio
    {/if}
</button>

{#if $pasoAviso !== "oculto"}
    <div class="fondo" role="dialog" aria-modal="true" aria-labelledby="modo-servicio-titulo">
        <div class="caja">
            {#if $pasoAviso === "aviso"}
                <h2 id="modo-servicio-titulo">Modo servicio</h2>
                <p class="mensaje">{MENSAJE_BLOQUEO}</p>
                <div class="botones">
                    <button class="principal" on:click={() => aplicar("seguir")}>Seguir en servicio</button>
                    <button on:click={() => aplicar("pedir-desactivar")}>Desactivar modo servicio</button>
                </div>
            {:else}
                <h2 id="modo-servicio-titulo">¿Desactivar el modo servicio?</h2>
                <p>{MENSAJE_CONFIRMAR}</p>
                <div class="botones">
                    <button class="principal" on:click={() => aplicar("cancelar")}>Cancelar</button>
                    <button class="peligro" on:click={() => aplicar("confirmar")}>Sí, desactivar</button>
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .marco {
        position: fixed;
        inset: 0;
        border: 4px solid #e0233c;
        pointer-events: none;
        z-index: 9998;
    }

    .indicador-modo-servicio {
        position: fixed;
        right: 12px;
        bottom: 34px;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        border-radius: 20px;
        border: 1px solid var(--primary-lighter, #2f3542);
        background-color: var(--primary-darkest, #12121c);
        color: var(--text, #f0f0ff);
        opacity: 0.75;
        font-size: 0.85em;
        cursor: pointer;
    }
    .indicador-modo-servicio:hover {
        opacity: 1;
    }
    .indicador-modo-servicio.activo {
        background-color: #e0233c;
        border-color: #ff6b7d;
        color: white;
        opacity: 1;
        font-weight: bold;
        font-size: 1em;
        letter-spacing: 0.5px;
    }

    .punto {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background-color: white;
        animation: latido 1.6s ease-in-out infinite;
    }
    @keyframes latido {
        50% {
            opacity: 0.3;
        }
    }
    .desde {
        font-weight: normal;
        opacity: 0.85;
        font-size: 0.85em;
    }

    .fondo {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: rgb(0 0 0 / 0.6);
    }
    .caja {
        max-width: 520px;
        padding: 26px 30px;
        border-radius: 10px;
        border-top: 6px solid #e0233c;
        background-color: var(--primary, #242832);
        color: var(--text, #f0f0ff);
        box-shadow: 0 10px 40px rgb(0 0 0 / 0.5);
    }
    .caja h2 {
        margin: 0 0 12px;
        font-size: 1.3em;
    }
    /* FreeShow corta los párrafos a una línea; aquí el mensaje completo debe leerse */
    .caja p {
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
    }
    .mensaje {
        font-size: 1.15em;
        line-height: 1.5;
    }
    .botones {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: flex-end;
        margin-top: 20px;
    }
    .botones button {
        padding: 8px 16px;
        border-radius: 6px;
        border: 1px solid var(--primary-lighter, #2f3542);
        background-color: var(--primary-darker, #191923);
        color: var(--text, #f0f0ff);
        font-size: 1em;
        cursor: pointer;
    }
    .botones button.principal {
        background-color: var(--primary-lighter, #2f3542);
        font-weight: bold;
    }
    .botones button.peligro {
        background-color: #e0233c;
        border-color: #e0233c;
        color: white;
    }
</style>
