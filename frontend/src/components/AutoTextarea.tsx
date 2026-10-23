import { TextareaHTMLAttributes, useLayoutEffect, useRef } from "react";

// Pole tekstowe, które rośnie razem z treścią, żeby nic nie było ucięte.
// singleLine: Enter nie robi nowej linii (np. składnik), ale długi tekst i tak się zawija.
type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { singleLine?: boolean };

export default function AutoTextarea({ singleLine, onKeyDown, rows = 1, ...props }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  };

  useLayoutEffect(fit, [props.value]);

  useLayoutEffect(() => {
    // Po obróceniu telefonu zmienia się szerokość, więc i wysokość
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <textarea
      ref={ref}
      rows={rows}
      className="auto"
      onKeyDown={(e) => {
        if (singleLine && e.key === "Enter") e.preventDefault();
        onKeyDown?.(e);
      }}
      {...props}
    />
  );
}
