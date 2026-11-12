import { FormEvent, useEffect, useRef, useState } from "react";
import { api, PantryItem } from "../api";
import { sendChanges } from "../lib/offlineShopping";
import { useToast } from "../lib/toast";
import { forgetPantry } from "../lib/usePantry";
import ExpirySheet, { expiresLabel, inDays, USE_FIRST_DAYS } from "./ExpirySheet";
import ReceiptSheet from "./ReceiptSheet";
import SwipeRow from "./SwipeRow";

// Spiżarnia: co jest w domu. Trafia tu to, co odhaczysz na liście zakupów, to, co dopiszesz
// tutaj, i produkty z paragonu (jeśli włączone w Ustawieniach). Przepisy oznaczają składniki,
// których tu nie ma, jako „brak”, a lista zakupów je pomija.
export default function PantryView({ receipts, onCount }: { receipts: boolean; onCount: (count: number) => void }) {
  const [items, setItemsState] = useState<PantryItem[] | null>(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<PantryItem | null>(null);
  const [files, setFiles] = useState<File[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { toast, undoable, run } = useToast();

  const setItems = (list: PantryItem[]) => {
    setItemsState(list);
    onCount(list.length);
    forgetPantry();
  };

  useEffect(() => {
    // Najpierw odhaczenia z listy zakupów, które jeszcze nie doszły do serwera - to one zasilają spiżarnię
    sendChanges()
      .then(() => api.pantryItems())
      .then(setItems, () => setItemsState([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const name = text.trim();
    if (!name) return;
    setText("");
    const list = await run(() => api.addToPantry([name]));
    if (list) setItems(list);
  };

  // „Zużyte”: znika od razu, a naprawdę usuwamy po kilku sekundach (można cofnąć)
  const used = (item: PantryItem) => {
    setEditing(null);
    const before = items ?? [];
    setItemsState(before.filter((i) => i !== item));
    undoable(
      `Zużyte: ${item.name}`,
      () => api.removeFromPantry([item.name]).then(setItems),
      () => setItemsState(before),
    );
  };

  const setTerm = async (item: PantryItem, day: string | null) => {
    setEditing(null);
    const list = await run(() => api.setPantryExpires(item.name, day));
    if (list) setItems(list);
  };

  // Dopisanie do zakupów zabiera produkt ze spiżarni (serwer robi to sam)
  const toShopping = async (item: PantryItem) => {
    setEditing(null);
    if (await run(() => api.addShoppingItem(item.name))) {
      toast(`Dopisano do zakupów: ${item.name}`);
      setItems(await api.pantryItems());
    }
  };

  if (items === null) return <p className="muted center">Ładowanie…</p>;

  const soon = inDays(USE_FIRST_DAYS);
  const urgent = items.filter((i) => i.expires && i.expires <= soon).sort((a, b) => a.expires!.localeCompare(b.expires!));
  const rest = items.filter((i) => !urgent.includes(i));
  const aisles = [...new Map(rest.map((i) => [i.aisle, i.aisle_order])).entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);

  const row = (item: PantryItem) => (
    <SwipeRow key={item.name} onClick={() => setEditing(item)} onDelete={() => used(item)} deleteLabel="Zużyte">
      <span className="grow item-text">{item.name}</span>
      {item.expires && <span className={`pantry-term ${item.expires <= soon ? "soon" : ""}`}>{expiresLabel(item.expires)}</span>}
    </SwipeRow>
  );

  return (
    <>
      <form className="row" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Dopisz, co masz, np. jajka" enterKeyHint="done" autoCapitalize="none" />
        <button disabled={!text.trim()}>Dodaj</button>
      </form>
      {receipts && (
        <>
          <button type="button" className="wide" onClick={() => fileInput.current?.click()}>
            📷 Dodaj z paragonu
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const chosen = [...(e.target.files ?? [])].slice(0, 3);
              e.target.value = "";
              if (chosen.length) setFiles(chosen);
            }}
          />
        </>
      )}

      {items.length === 0 ? (
        <p className="muted center">
          Spiżarnia jest pusta. Odhacz coś na liście zakupów albo dopisz powyżej, co masz w domu - przepisy pokażą wtedy, czego brakuje.
        </p>
      ) : (
        <>
          {urgent.length > 0 && (
            <section>
              <h2 className="aisle">⏰ Zużyj najpierw</h2>
              <ul className="checklist shopping">{urgent.map(row)}</ul>
            </section>
          )}
          {aisles.map((name) => (
            <section key={name}>
              <h2 className="aisle">{name}</h2>
              <ul className="checklist shopping">{rest.filter((i) => i.aisle === name).map(row)}</ul>
            </section>
          ))}
          <p className="muted small center">Stuknij produkt, żeby ustawić termin. Przesuń w lewo, gdy się skończy.</p>
        </>
      )}

      {editing && (
        <ExpirySheet
          name={editing.name}
          expires={editing.expires ?? undefined}
          onTerm={(day) => setTerm(editing, day)}
          onRemove={() => used(editing)}
          onToShopping={() => toShopping(editing)}
          onClose={() => setEditing(null)}
        />
      )}
      {files && (
        <ReceiptSheet
          files={files}
          onClose={() => setFiles(null)}
          onDone={(list) => {
            setFiles(null);
            setItems(list);
          }}
        />
      )}
    </>
  );
}
