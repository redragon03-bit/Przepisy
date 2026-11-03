import { useRef, useState } from "react";
// Zmiana kolejności na liście przez przeciągnięcie palcem za uchwyt (numer kroku, ⠿ przy składniku).
// Zwraca: który wiersz jest przeciągany, ref dla wierszy i właściwości dla uchwytu.
export function useReorder(items, onChange) {
    const [dragging, setDragging] = useState(null);
    const rows = useRef([]);
    const move = (from, to) => {
        const next = [...items];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        onChange(next);
    };
    const handle = (index) => ({
        onPointerDown: (e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(index);
        },
        onPointerMove: (e) => {
            if (dragging === null)
                return;
            // Zamieniamy z sąsiednim wierszem, gdy palec minie jego środek (bez "skakania" przy różnych wysokościach)
            const neighbour = (i) => rows.current[i]?.getBoundingClientRect();
            const below = neighbour(dragging + 1);
            const above = neighbour(dragging - 1);
            if (below && e.clientY > below.top + below.height / 2) {
                move(dragging, dragging + 1);
                setDragging(dragging + 1);
            }
            else if (above && e.clientY < above.top + above.height / 2) {
                move(dragging, dragging - 1);
                setDragging(dragging - 1);
            }
        },
        onPointerUp: () => setDragging(null),
        onPointerCancel: () => setDragging(null),
        style: { touchAction: "none", cursor: "grab" },
    });
    const rowRef = (index) => (el) => {
        rows.current[index] = el;
    };
    rows.current.length = items.length;
    return { dragging, rowRef, handle };
}
