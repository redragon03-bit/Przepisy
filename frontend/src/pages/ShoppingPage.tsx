import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ShoppingItem } from "../api";
import PantryView from "../components/PantryView";
import RenameSheet from "../components/RenameSheet";
import SwipeRow from "../components/SwipeRow";
import { useHiddenPromoStores, usePromoBadges } from "../lib/promoBadges";
import { useRemembered } from "../lib/remember";
import { forgetPantry } from "../lib/usePantry";
import { findSame, sameProduct } from "../lib/similar";
import { applyChange, cachedItems, cacheItems, Change, pendingChanges, queueChange, sendChanges } from "../lib/offlineShopping";
import { useToast } from "../lib/toast";
import { usePullToRefresh } from "../lib/usePullToRefresh";

// Zakupy mają dwa widoki: "Do kupienia" (lista zakupów) i "W domu" (spiżarnia, PantryView).
// Lista jest pogrupowana działami sklepu. Pozycje dodaje się z przepisu, z planu tygodnia
// albo ręcznie tutaj. Odhaczona pozycja trafia do spiżarni, a dopisana - znika ze spiżarni
// (robi to serwer). Działa bez internetu (patrz lib/offlineShopping.ts), a z Home Assistant
// zgadza się w obie strony.
export default function ShoppingPage({ haEnabled }: { haEnabled: boolean }) {
  // Widok zapamiętany w telefonie; link z "Co ugotuję?" otwiera spiżarnię (?widok=dom)
  const [params, setParams] = useSearchParams();
  const [savedView, setSavedView] = useRemembered<"list" | "pantry">("shopping-view", "list");
  const view = params.get("widok") === "dom" ? "pantry" : savedView;
  const [pantryCount, setPantryCount] = useState<number | null>(null);
  const [pantryNames, setPantryNames] = useState<string[]>([]);
  const [receipts, setReceipts] = useRemembered<boolean>("receipts-enabled", false);
  const [items, setItemsState] = useState<ShoppingItem[] | null>(cachedItems);
  const [text, setText] = useState("");
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  // Pozycja, której tekst zmieniamy (przytrzymanie wiersza)
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const { toast, undoable, run } = useToast();
  const [showPromos] = usePromoBadges();
  // Tylko sklepy zaznaczone w Promocjach
  const [hiddenStores] = useHiddenPromoStores();

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

  const loadPantry = () =>
    api.getPantry().then((names) => {
      setPantryNames(names);
      setPantryCount(names.length);
    }, () => undefined);

  useEffect(() => {
    loadPantry();
    api.receiptSettings().then((r) => setReceipts(r.enabled && r.ai_enabled), () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showView = (next: "list" | "pantry") => {
    setSavedView(next);
    if (params.get("widok")) setParams({}, { replace: true });
    // Spiżarnia mogła dopisać coś do zakupów ("Kończy się")
    if (next === "list") refresh();
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
      // Odhaczenie i dopisanie zmieniają spiżarnię - znaczniki "brak" liczymy od nowa
      if (sent) {
        forgetPantry();
        loadPantry();
      }
      // Nowa albo przemianowana pozycja dostaje od serwera numer, dział sklepu i promocje
      if (sent && (c.op === "add" || c.op === "rename")) refresh();
    });
  };

  // Odhaczone = kupione, trafia do spiżarni. "Cofnij" odznacza (i zabiera ze spiżarni).
  const check = (item: ShoppingItem) => {
    change({ op: "check", id: item.id, checked: !item.checked });
    if (!item.checked) {
      undoable(`Kupione: ${item.text}`, () => undefined, () => change({ op: "check", id: item.id, checked: false }, applyChange(items ?? [], { op: "check", id: item.id, checked: true })));
    }
  };

  // Ten sam produkt już jest na liście ("Kurczak piersi" przy "Pierś z kurczaka") - nie dublujemy go
  const same = findSame(text, items ?? [], (i) => i.text);
  const inPantry = same ? undefined : findSame(text, pantryNames, (n) => n);

  const addNew = () => {
    change({ op: "add", id: -Date.now(), text: text.trim() });
    setText("");
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (!same) return addNew();
    setText("");
    if (same.checked) {
      // Kupione wcześniej - wraca na listę (i znika ze spiżarni)
      change({ op: "check", id: same.id, checked: false });
      toast(`Z powrotem na liście: ${same.text}`);
    } else {
      toast(`Już jest na liście: ${same.text}`);
    }
  };

  // Podobne pozycje, które już są na liście (np. jedna z przepisu, druga dopisana w HA)
  const twins = (() => {
    const open = (items ?? []).filter((i) => !i.checked && i.id > 0);
    for (const [index, first] of open.entries()) {
      const second = open.slice(index + 1).find((other) => sameProduct(first.text, other.text));
      if (second) return [first, second];
    }
    return null;
  })();

  // Zostaje pozycja z przepisu (ma ilość i nazwę składnika), a jak obie są dopisane - starsza
  const mergeTwins = ([first, second]: ShoppingItem[]) => {
    const [keep, drop] = second.recipes && !first.recipes ? [second, first] : [first, second];
    removeLater(`Połączono: zostaje „${keep.text}”`, [drop], [{ op: "delete", id: drop.id }]);
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

  const switcher = (
    <div className="segmented" role="group" aria-label="Widok">
      <button type="button" aria-pressed={view === "list"} onClick={() => showView("list")}>
        Do kupienia
        {items && <span className="count">{items.filter((i) => !i.checked).length}</span>}
      </button>
      <button type="button" aria-pressed={view === "pantry"} onClick={() => showView("pantry")}>
        W domu
        {pantryCount !== null && <span className="count">{pantryCount}</span>}
      </button>
    </div>
  );

  if (view === "pantry") {
    return (
      <>
        <header className="topbar">
          <h1>Zakupy</h1>
        </header>
        {switcher}
        <PantryView receipts={receipts} onCount={setPantryCount} />
      </>
    );
  }

  if (!items)
    return (
      <>
        {switcher}
        <p className="muted center">{offline ? "Brak połączenia - lista pojawi się po połączeniu." : "Ładowanie…"}</p>
      </>
    );
  const open = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);
  const aisles = [...new Map(open.map((i) => [i.aisle, i.aisle_order])).entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
  const notInHa = open.some((i) => !i.in_ha && i.id > 0);

  const row = (item: ShoppingItem) => (
    <SwipeRow
      key={item.id}
      className={item.checked ? "done" : ""}
      checked={item.checked}
      onClick={() => check(item)}
      onLongPress={() => setEditing(item)}
      onDelete={() => removeLater(`Usunięto „${item.text}”`, [item], [{ op: "delete", id: item.id }])}
    >
      <span className="check" aria-hidden="true" />
      <span className="grow">
        <span className="item-text">{item.text}</span>
        {item.recipes && <span className="muted small"> · {item.recipes}</span>}
        {showPromos &&
          itemPromos(item, hiddenStores).map((label) => (
            <span key={label} className="tag tag-promo">
              🏷️ {label}
            </span>
          ))}
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
      {switcher}
      {offline && <p className="box warning small">Brak połączenia - zmiany zapiszą się, gdy wróci internet.</p>}

      <form className="row" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Dopisz, np. papier do pieczenia" enterKeyHint="done" />
        <button disabled={!text.trim()}>Dodaj</button>
      </form>
      {same ? (
        <p className="similar-hint small">
          {same.checked ? "Już kupione" : "Już jest na liście"}: <b>{same.text}</b>
          {same.checked ? " - Dodaj przywróci to na listę." : " - Dodaj go nie zdubluje."}{" "}
          <button type="button" className="link" onClick={addNew}>
            Dodaj osobno
          </button>
        </p>
      ) : (
        inPantry && (
          <p className="similar-hint small">
            Masz w domu: <b>{inPantry}</b> - po dopisaniu zniknie ze spiżarni.
          </p>
        )
      )}
      {twins && !text.trim() && (
        <p className="similar-hint small">
          „{twins[0].text}” i „{twins[1].text}” to chyba to samo.{" "}
          <button type="button" className="link" onClick={() => mergeTwins(twins)}>
            Połącz
          </button>
        </p>
      )}

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
              <h2 className="aisle">Kupione - już w spiżarni</h2>
              <ul className="checklist shopping">{done.map(row)}</ul>
            </>
          )}
          <p className="muted small center">Przytrzymaj pozycję, żeby ją zmienić. Przesuń w lewo, żeby usunąć.</p>
          <div className="actions">
            {done.length > 0 && (
              <button type="button" onClick={() => removeLater("Usunięto kupione z listy (zostają w spiżarni)", done, [{ op: "clear", onlyChecked: true }])}>
                Usuń kupione
              </button>
            )}
            <button type="button" className="danger" onClick={() => removeLater("Wyczyszczono listę", items, [{ op: "clear", onlyChecked: false }])}>
              Wyczyść listę
            </button>
          </div>
        </>
      )}
      {editing && (
        <RenameSheet
          title="Zmień pozycję"
          text={editing.text}
          onClose={() => setEditing(null)}
          onSave={(newText) => {
            setEditing(null);
            change({ op: "rename", id: editing.id, text: newText });
          }}
        />
      )}
    </>
  );
}

// Plakietki promocji pozycji: po jednej z każdego sklepu zaznaczonego w Promocjach.
// Lista zapisana w telefonie przed 0.17.0 ma tylko jedną promocję (`promo`).
function itemPromos(item: ShoppingItem, hidden: Set<string>): string[] {
  const all = item.promos ?? (item.promo ? [{ store: item.promo.split(" ")[0], label: item.promo }] : []);
  return all.filter((p) => !hidden.has(p.store) && !item.text.includes(p.label)).map((p) => p.label);
}
