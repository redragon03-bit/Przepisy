import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { ToastProvider } from "./lib/toast";
import { TimersProvider } from "./lib/useTimers";
import "./styles.css";

// Przewijanie po "Wstecz" ustawiamy sami (lista przepisów), przeglądarka by to zrobiła za wcześnie.
history.scrollRestoration = "manual";

// Nowa wersja aplikacji: przy starcie i przy każdym powrocie do aplikacji pytamy serwer,
// czy jest nowsza. Jeśli tak, nowy service worker przejmuje stronę i ta przeładowuje się
// sama (registerType "autoUpdate") - bez ręcznego zamykania aplikacji na iPhonie.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = () => {
      if (navigator.onLine) registration.update().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
    setInterval(check, 60 * 60 * 1000);
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <TimersProvider>
          <App />
        </TimersProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
