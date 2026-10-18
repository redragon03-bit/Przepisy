import { useEffect, useState } from "react";
import { api, ShoppingItem } from "../api";

// Lista zakupów z odhaczaniem. Pozycje dodaje się z przepisu ("Do listy zakupów"),
// z planu tygodnia albo ręcznie tutaj.
export default function ShoppingPage({ haEnabled }: { haEnabled: boolean }) {
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => api.listShopping().then(setItems);
  useEffect(() => {
    refresh();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    await api.addShoppingItem(text);
    setText("");
    refresh();
  };

  const toggle = async (item: ShoppingItem) => {
    // Od razu zmieniamy na ekranie, żeby odhaczanie w sklepie nie czekało na serwer
    setItems((list) => list?.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)) ?? null);
    await api.setShoppingChecked(item.id, !item.checked);
  };

  const sendToHa = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await api.sendShoppingToHa();
      setMessage(`Wysłano do Home Assistant: ${result.added} pozycji.`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const clear = async (onlyChecked: boolean) => {
    if (!onlyChecked && !window.confirm("Wyczyścić całą listę zakupów?")) return;
    await api.clearShopping(onlyChecked);
    refresh();
  };

  if (!items) return <p className="muted center">Ładowanie…</p>;
  const open = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);

  const row = (item: ShoppingItem) => (
    <li key={item.id} className={item.checked ? "done" : ""} onClick={() => toggle(item)}>
      <span className="box-icon">{item.checked ? "☑" : "☐"}</span>
      <span className="grow">
        {item.text}
        {item.recipes && <span className="muted small"> · {item.recipes}</span>}
      </span>
      <button
        type="button"
        className="icon"
        aria-label="Usuń"
        onClick={async (e) => {
          e.stopPropagation();
          await api.deleteShoppingItem(item.id);
          refresh();
        }}
      >
        ✕
      </button>
    </li>
  );

  return (
    <>
      <header className="topbar">
        <h1>Zakupy</h1>
        {haEnabled && open.length > 0 && (
          <button type="button" className="button small" disabled={busy} onClick={sendToHa}>
            Wyślij do HA
          </button>
        )}
      </header>

      <form className="row" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Dopisz, np. papier do pieczenia" />
        <button disabled={!text.trim()}>Dodaj</button>
      </form>
      {message && <p className="muted small">{message}</p>}

      {items.length === 0 ? (
        <p className="muted center">Lista jest pusta. W przepisie stuknij „🛒 Do listy zakupów”.</p>
      ) : (
        <>
          <ul className="checklist shopping">{open.map(row)}</ul>
          {done.length > 0 && (
            <>
              <h2 className="muted small">Kupione</h2>
              <ul className="checklist shopping">{done.map(row)}</ul>
            </>
          )}
          <div className="actions">
            {done.length > 0 && (
              <button type="button" onClick={() => clear(true)}>
                Usuń kupione
              </button>
            )}
            <button type="button" className="danger" onClick={() => clear(false)}>
              Wyczyść listę
            </button>
          </div>
        </>
      )}
    </>
  );
}
