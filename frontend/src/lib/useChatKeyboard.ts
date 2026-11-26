import { useEffect } from "react";

// iPhone nie zmniejsza strony, gdy wysuwa się klawiatura - przesuwa cały widok w górę, żeby
// pokazać pole tekstowe. W czacie uciekały wtedy za górną krawędź nagłówek i ostatnie wiadomości.
// Gdy klawiatura jest otwarta, przypinamy treść czatu do widocznej części ekranu (visualViewport):
// rozmowa przewija się w środku, pole wpisywania siedzi tuż nad klawiaturą, pasek zakładek znika.
export function useChatKeyboard(onOpen: () => void) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let open = false;
    const update = () => {
      // Klawiatura zabiera zwykle 250+ px; mniejsze różnice to pasek adresu Safari
      const nowOpen = window.innerHeight - vv.height > 150;
      root.style.setProperty("--vv-top", `${vv.offsetTop}px`);
      root.style.setProperty("--vv-h", `${vv.height}px`);
      root.classList.toggle("kb-open", nowOpen);
      if (nowOpen && !open) requestAnimationFrame(onOpen);
      open = nowOpen;
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.classList.remove("kb-open");
      root.style.removeProperty("--vv-top");
      root.style.removeProperty("--vv-h");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
