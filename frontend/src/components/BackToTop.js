import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { scrollToTop } from "../lib/navigation";
// Pływający przycisk "do góry", gdy strona jest przewinięta o więcej niż ekran.
export default function BackToTop() {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const onScroll = () => setVisible(window.scrollY > window.innerHeight);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);
    return (_jsx("button", { type: "button", className: `back-to-top ${visible ? "visible" : ""}`, onClick: scrollToTop, "aria-label": "Przewi\u0144 na g\u00F3r\u0119", tabIndex: visible ? 0 : -1, children: _jsx("svg", { viewBox: "0 0 24 24", width: "22", height: "22", "aria-hidden": "true", children: _jsx("path", { d: "M6 15l6-6 6 6", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round" }) }) }));
}
