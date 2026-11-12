import { jsx as _jsx } from "react/jsx-runtime";
import { useLayoutEffect, useRef } from "react";
export default function AutoTextarea({ singleLine, onKeyDown, rows = 1, ...props }) {
    const ref = useRef(null);
    const fit = () => {
        const el = ref.current;
        if (!el)
            return;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    };
    useLayoutEffect(fit, [props.value]);
    useLayoutEffect(() => {
        // Po obróceniu telefonu zmienia się szerokość, więc i wysokość
        window.addEventListener("resize", fit);
        return () => window.removeEventListener("resize", fit);
    }, []);
    return (_jsx("textarea", { ref: ref, rows: rows, className: "auto", onKeyDown: (e) => {
            if (singleLine && e.key === "Enter")
                e.preventDefault();
            onKeyDown?.(e);
        }, ...props }));
}
