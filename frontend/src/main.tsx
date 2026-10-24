import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ToastProvider } from "./lib/toast";
import { TimersProvider } from "./lib/useTimers";
import "./styles.css";

// Przewijanie po "Wstecz" ustawiamy sami (lista przepisów), przeglądarka by to zrobiła za wcześnie.
history.scrollRestoration = "manual";

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
