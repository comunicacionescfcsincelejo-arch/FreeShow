import { defineConfig } from "@playwright/test"

// Pruebas de punta a punta de los módulos con Electron real (nunca usan la DeckLink).
// Antes: npx tsc -p config/typescript/tsconfig.electron.json
// Ejecutar: npx playwright test --config src/modulos/playwright.config.ts
export default defineConfig({
    testDir: ".",
    testMatch: "**/*.e2e.ts",
    // la interfaz la sirve Vite en el puerto 3000, como en npm start
    globalSetup: "./pruebasE2E.ts",
    timeout: 180_000,
    fullyParallel: false,
    workers: 1,
    reporter: "line"
})
