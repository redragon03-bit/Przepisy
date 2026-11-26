import { useEffect } from "react";

// iPhone nie zmniejsza strony, gdy wysuwa się klawiatura - przesuwa cały widok w górę, żeby
// pokazać pole tekstowe. W czacie uciekały wtedy za górną krawędź nagłówek i ostatnie wiadomości.
// Gdy klawiatura jest otwarta, przypinamy treść czatu do widocznej części ekranu (visualViewport):
// rozmowa przewija się w środku, pole wpisywania siedzi tuż nad klawiaturą, pasek zakładek znika.
//
// Klawiaturę rozpoznajemy po stuknięciu w pole czatu na telefonie (ekran dotykowy). Samo
// porównanie wysokości nie wystarcza: w aplikacji z ekranu głównego iOS zmniejsza też
// window.innerHeight, więc różnica bywa zerowa, choć klawiatura zasłania pół ekranu.
export function useChatKeyboard(onOpen: () => void) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    // Największa widoczna wysokość = ekran bez klawiatury (rośnie np. po obróceniu telefonu)
    let full = Math.max(vv.height, window.innerHeight);
    let open = false;
    let timers: number[] = [];
    const typing = () => touch && !!document.activeElement?.closest(".chat-input");
    const update = () => {
      full = Math.max(full, vv.height);
      // Klawiatura zabiera zwykle 250+ px; mniejsze różnice to pasek adresu Safari
      const nowOpen = typing() || full - vv.height > 150;
      root.style.setProperty("--vv-top", `${vv.offsetTop}px`);
      root.style.setProperty("--vv-h", `${vv.height}px`);
      root.classList.toggle("kb-open", nowOpen);
      if (nowOpen && !open) requestAnimationFrame(onOpen);
      open = nowOpen;
    };
    // Klawiatura wysuwa się chwilę - poprawiamy położenie jeszcze kilka razy po stuknięciu
    const settle = () => {
      update();
      timers.forEach(clearTimeout);
      timers = [100, 300, 600].map((ms) => window.setTimeout(update, ms));
    };
    const onOrientation = () => {
      full = 0;
      settle();
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    document.addEventListener("focusin", settle);
    document.addEventListener("focusout", settle);
    window.addEventListener("orientationchange", onOrientation);
    return () => {
      timers.forEach(clearTimeout);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.removeEventListener("focusin", settle);
      document.removeEventListener("focusout", settle);
      window.removeEventListener("orientationchange", onOrientation);
      root.classList.remove("kb-open");
      root.style.removeProperty("--vv-top");
      root.style.removeProperty("--vv-h");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
