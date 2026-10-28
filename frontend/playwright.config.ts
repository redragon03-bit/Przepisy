import { defineConfig, devices } from "@playwright/test";

// Testy całej aplikacji w przeglądarce (jak na iPhonie): `npm run test:e2e`.
// Przed testami trzeba zbudować frontend (`npm run build`) - serwer Pythona podaje go
// razem z API, na czystej bazie w folderze tymczasowym.
const PORT = 8765;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // jedna baza dla wszystkich testów
  use: {
    ...devices["iPhone 13"],
    // Testy działają w Chromium (jak w CI); rozmiar ekranu i dotyk jak w iPhonie 13
    browserName: "chromium",
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    // Service worker (PWA) omija symulowany brak internetu w Chromium - testujemy bez niego
    serviceWorkers: "block",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : undefined,
  },
  webServer: {
    command: `sh -c 'DATA_DIR=$(mktemp -d) APP_PASSWORD=test YTDLP_AUTO_UPDATE=false STATIC_DIR=../frontend/dist ${process.env.PYTHON ?? "python"} -m uvicorn app.main:app --port ${PORT}'`,
    cwd: "../backend",
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
  },
});
