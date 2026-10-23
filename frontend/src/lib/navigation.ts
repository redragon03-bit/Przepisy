import { useNavigate } from "react-router-dom";

export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// "Wróć" jak w przeglądarce, ale gdy nie ma dokąd (przepis otwarty z linku albo iPhone
// przeładował apkę w tle), idziemy na podaną stronę zamiast nie robić nic.
export function useGoBack(fallback: string) {
  const navigate = useNavigate();
  return () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
}
