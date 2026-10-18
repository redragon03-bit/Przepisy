// Ocena 1-5. Kliknięcie w aktualną ocenę ją usuwa.
export default function Stars({ value, onChange }: { value: number | null; onChange?: (rating: number) => void }) {
  return (
    <span className="stars" aria-label={value ? `Ocena ${value} na 5` : "Bez oceny"}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button key={n} type="button" className="link" onClick={() => onChange(n === value ? 0 : n)}>
            {value && n <= value ? "★" : "☆"}
          </button>
        ) : (
          <span key={n}>{value && n <= value ? "★" : "☆"}</span>
        ),
      )}
    </span>
  );
}
