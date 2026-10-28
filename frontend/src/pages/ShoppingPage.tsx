import { FormEvent, useEffect, useState } from "react";
import { api, ShoppingItem } from "../api";
import SwipeRow from "../components/SwipeRow";
import { applyChange, cachedItems, cacheItems, Change, pendingChanges, queueChange, sendChanges } from "../lib/offlineShopping";
import { useToast } from "../lib/toast";
import { usePullToRefresh } from "../lib/usePullToRefresh";

// Lista zakupów z odhaczaniem, pogrupowana działami sklepu. Pozycje dodaje się z przepisu,
// z planu tygodnia albo ręcznie tutaj. Działa bez internetu (patrz lib/offlineShopping.ts),
// a z Home Assistant zgadza się w obie strony.
export default function ShoppingPage({ haEnabled }: { haEnabled: boolean }) {
  const [items, setItemsState] = useState<ShoppingItem[] | null>(cachedItems);
  const [text, setText] = useState("");
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast, undoable, run } = useToast();

  const setItems = (list: ShoppingItem[]) => {
    setItemsState(list);
    cacheItems(list);
  };

  // Najpierw wysyłamy zmiany zrobione bez internetu, potem pobieramy świeżą listę (z HA, jeśli jest)
  const refresh = async () => {
    const sent = await sendChanges();
    setOffline(!sent);
    if (!sent) return;
    try {
      const fresh = haEnabled ? await api.syncShopping().catch(() => api.listShopping()) : await api.listShopping();
      // Zmiany zrobione w trakcie pobierania nakładamy jeszcze raz
      setItems(pendingChanges().reduce(applyChange, fresh));
    } catch {
      setOffline(true);
    }
  };

  useEffect(() => {
    refresh();
    window.addEventListener("online", refresh);
    return () => window.removeEventListener("online", refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { pull, refreshing, ready } = usePullToRefresh(refresh);

  // Każda zmiana: od razu na ekranie i w kolejce, potem na serwer
  const change = (c: Change, list = items ?? []) => {
    setItems(applyChange(list, c));
    queueChange(c);
    sendChanges().then((sent) => {
      setOffline(!sent);
      // Nowa pozycja dostaje od serwera numer i dział sklepu
      if (sent && c.op === "add") refresh();
    });
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    change({ op: "add", id: -Date.now(), text: text.trim() });
    setText("");
  };

  // Usunięcie z "Cofnij": pozycja znika od razu, a naprawdę usuwamy ją po kilku sekundach
  const removeLater = (message: string, hidden: ShoppingItem[], commit: Change[]) => {
    const before = items ?? [];
    setItemsState(before.filter((i) => !hidden.includes(i)));
    undoable(
      message,
      () => {
        let list = before;
        for (const c of commit) {
          list = applyChange(list, c);
          queueChange(c);
        }
        setItems(list);
        return sendChanges().then((sent) => setOffline(!sent));
      },
      () => setItemsState(before),
    );
  };

  const sendToHa = async () => {
    setBusy(true);
    const result = await run(() => api.sendShoppingToHa());
    setBusy(false);
    if (result) {
      toast(`Wysłano do Home Assistant: ${result.added}.`);
      refresh();
    }
  };

  if (!items) return <p className="muted center">{offline ? "Brak połączenia - lista pojawi się po połączeniu." : "Ładowanie…"}</p>;
  const open = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);
  const aisles = [...new Map(open.map((i) => [i.aisle, i.aisle_order])).entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
  const notInHa = open.some((i) => !i.in_ha && i.id > 0);

  const row = (item: ShoppingItem) => (
    <SwipeRow
      key={item.id}
      className={item.checked ? "done" : ""}
      onClick={() => change({ op: "check", id: item.id, checked: !item.checked })}
      onDelete={() => removeLater(`Usunięto „${item.text}”`, [item], [{ op: "delete", id: item.id }])}
    >
      <span className="box-icon">{item.checked ? "☑" : "☐"}</span>
      <span className="grow">
        {item.text}
        {item.recipes && <span className="muted small"> · {item.recipes}</span>}
      </span>
    </SwipeRow>
  );

  return (
    <>
      {(pull > 0 || refreshing) && (
        <div className="pull-indicator" style={{ height: refreshing ? 40 : pull }}>
          {refreshing ? "Odświeżam…" : ready ? "↻ Puść, aby odświeżyć" : "↓"}
        </div>
      )}
      <header className="topbar">
        <h1>Zakupy</h1>
        {haEnabled && notInHa && !offline && (
          <button type="button" className="button small" disabled={busy} onClick={sendToHa}>
            Wyślij do HA
          </button>
        )}
      </header>
      {offline && <p className="box warning small">Brak połączenia - zmiany zapiszą się, gdy wróci internet.</p>}

      <form className="row" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Dopisz, np. papier do pieczenia" enterKeyHint="done" />
        <button disabled={!text.trim()}>Dodaj</button>
      </form>

      {items.length === 0 ? (
        <p className="muted center">Lista jest pusta. W przepisie stuknij „⋯” → „Do zakupów”.</p>
      ) : (
        <>
          {aisles.map((name) => (
            <section key={name}>
              <h2 className="aisle">{name}</h2>
              <ul className="checklist shopping">{open.filter((i) => i.aisle === name).map(row)}</ul>
            </section>
          ))}
          {done.length > 0 && (
            <>
              <h2 className="aisle">Kupione</h2>
              <ul className="checklist shopping">{done.map(row)}</ul>
            </>
          )}
          <p className="muted small center">Przesuń pozycję w lewo, żeby ją usunąć.</p>
          <div className="actions">
            {done.length > 0 && (
              <button type="button" onClick={() => removeLater(done.some((i) => i.recipes) ? "Usunięto kupione - produkty z przepisów są teraz w spiżarni" : "Usunięto kupione", done, [{ op: "clear", onlyChecked: true }])}>
                Usuń kupione
              </button>
            )}
            <button type="button" className="danger" onClick={() => removeLater("Wyczyszczono listę", items, [{ op: "clear", onlyChecked: false }])}>
              Wyczyść listę
            </button>
          </div>
        </>
      )}
    </>
  );
}
