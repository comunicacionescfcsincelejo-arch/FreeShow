import { defineConfig } from "@playwright/test"

// Pruebas de punta a punta del vigilante con Electron real (sin DeckLink): npx playwright test --config src/modulos/vigilante-salidas/pruebas/playwright.config.ts
export default defineConfig({
    testDir: ".",
    testMatch: "**/*.e2e.ts",
    timeout: 180_000,
    fullyParallel: false,
    workers: 1,
    reporter: "line"
})
