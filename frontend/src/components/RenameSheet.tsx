import { FormEvent, ReactNode, useState } from "react";
import Sheet from "./Sheet";

// Panel zmiany tekstu pozycji (lista zakupów, spiżarnia): pole z obecnym tekstem i „Zapisz”.
// Otwiera go przytrzymanie wiersza - na ekranie nie przybywa przycisków.
export default function RenameSheet({ title, text, onSave, onClose, children }: {
  title: string;
  text: string;
  onSave: (text: string) => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [value, setValue] = useState(text);
  const changed = value.trim() && value.trim() !== text;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (changed) onSave(value.trim());
    else onClose();
  };

  return (
    <Sheet title={title} onClose={onClose} list>
      <form className="row" onSubmit={submit}>
        <input value={value} onChange={(e) => setValue(e.target.value)} aria-label="Nowy tekst" enterKeyHint="done" autoFocus />
        <button type="submit" className="primary" disabled={!changed}>
          Zapisz
        </button>
      </form>
      {children}
    </Sheet>
  );
}
