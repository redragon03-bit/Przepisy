import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { api } from "../api";
import SwipeRow from "../components/SwipeRow";
import { usePromoBadges } from "../lib/promoBadges";
import { applyChange, cachedItems, cacheItems, pendingChanges, queueChange, sendChanges } from "../lib/offlineShopping";
import { useToast } from "../lib/toast";
import { usePullToRefresh } from "../lib/usePullToRefresh";
// Lista zakupów z odhaczaniem, pogrupowana działami sklepu. Pozycje dodaje się z przepisu,
// z planu tygodnia albo ręcznie tutaj. Działa bez internetu (patrz lib/offlineShopping.ts),
// a z Home Assistant zgadza się w obie strony.
export default function ShoppingPage({ haEnabled }) {
    const [items, setItemsState] = useState(cachedItems);
    const [text, setText] = useState("");
    const [offline, setOffline] = useState(false);
    const [busy, setBusy] = useState(false);
    const { toast, undoable, run } = useToast();
    const [showPromos] = usePromoBadges();
    const setItems = (list) => {
        setItemsState(list);
        cacheItems(list);
    };
    // Najpierw wysyłamy zmiany zrobione bez internetu, potem pobieramy świeżą listę (z HA, jeśli jest)
    const refresh = async () => {
        const sent = await sendChanges();
        setOffline(!sent);
        if (!sent)
            return;
        try {
            const fresh = haEnabled ? await api.syncShopping().catch(() => api.listShopping()) : await api.listShopping();
            // Zmiany zrobione w trakcie pobierania nakładamy jeszcze raz
            setItems(pendingChanges().reduce(applyChange, fresh));
        }
        catch {
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
    const change = (c, list = items ?? []) => {
        setItems(applyChange(list, c));
        queueChange(c);
        sendChanges().then((sent) => {
            setOffline(!sent);
            // Nowa pozycja dostaje od serwera numer i dział sklepu
            if (sent && c.op === "add")
                refresh();
        });
    };
    const add = (e) => {
        e.preventDefault();
        if (!text.trim())
            return;
        change({ op: "add", id: -Date.now(), text: text.trim() });
        setText("");
    };
    // Usunięcie z "Cofnij": pozycja znika od razu, a naprawdę usuwamy ją po kilku sekundach
    const removeLater = (message, hidden, commit) => {
        const before = items ?? [];
        setItemsState(before.filter((i) => !hidden.includes(i)));
        undoable(message, () => {
            let list = before;
            for (const c of commit) {
                list = applyChange(list, c);
                queueChange(c);
            }
            setItems(list);
            return sendChanges().then((sent) => setOffline(!sent));
        }, () => setItemsState(before));
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
    if (!items)
        return _jsx("p", { className: "muted center", children: offline ? "Brak połączenia - lista pojawi się po połączeniu." : "Ładowanie…" });
    const open = items.filter((i) => !i.checked);
    const done = items.filter((i) => i.checked);
    const aisles = [...new Map(open.map((i) => [i.aisle, i.aisle_order])).entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
    const notInHa = open.some((i) => !i.in_ha && i.id > 0);
    const row = (item) => (_jsxs(SwipeRow, { className: item.checked ? "done" : "", checked: item.checked, onClick: () => change({ op: "check", id: item.id, checked: !item.checked }), onDelete: () => removeLater(`Usunięto „${item.text}”`, [item], [{ op: "delete", id: item.id }]), children: [_jsx("span", { className: "check", "aria-hidden": "true" }), _jsxs("span", { className: "grow", children: [_jsx("span", { className: "item-text", children: item.text }), item.recipes && _jsxs("span", { className: "muted small", children: [" \u00B7 ", item.recipes] }), showPromos && item.promo && !item.text.includes(item.promo) && _jsxs("span", { className: "tag tag-promo", children: ["\uD83C\uDFF7\uFE0F ", item.promo] })] })] }, item.id));
    return (_jsxs(_Fragment, { children: [(pull > 0 || refreshing) && (_jsx("div", { className: "pull-indicator", style: { height: refreshing ? 40 : pull }, children: refreshing ? "Odświeżam…" : ready ? "↻ Puść, aby odświeżyć" : "↓" })), _jsxs("header", { className: "topbar", children: [_jsx("h1", { children: "Zakupy" }), haEnabled && notInHa && !offline && (_jsx("button", { type: "button", className: "button small", disabled: busy, onClick: sendToHa, children: "Wy\u015Blij do HA" }))] }), offline && _jsx("p", { className: "box warning small", children: "Brak po\u0142\u0105czenia - zmiany zapisz\u0105 si\u0119, gdy wr\u00F3ci internet." }), _jsxs("form", { className: "row", onSubmit: add, children: [_jsx("input", { value: text, onChange: (e) => setText(e.target.value), placeholder: "Dopisz, np. papier do pieczenia", enterKeyHint: "done" }), _jsx("button", { disabled: !text.trim(), children: "Dodaj" })] }), items.length === 0 ? (_jsx("p", { className: "muted center", children: "Lista jest pusta. W przepisie stuknij \u201E\u22EF\u201D \u2192 \u201EDo zakup\u00F3w\u201D." })) : (_jsxs(_Fragment, { children: [aisles.map((name) => (_jsxs("section", { children: [_jsx("h2", { className: "aisle", children: name }), _jsx("ul", { className: "checklist shopping", children: open.filter((i) => i.aisle === name).map(row) })] }, name))), done.length > 0 && (_jsxs(_Fragment, { children: [_jsx("h2", { className: "aisle", children: "Kupione" }), _jsx("ul", { className: "checklist shopping", children: done.map(row) })] })), _jsx("p", { className: "muted small center", children: "Przesu\u0144 pozycj\u0119 w lewo, \u017Ceby j\u0105 usun\u0105\u0107." }), _jsxs("div", { className: "actions", children: [done.length > 0 && (_jsx("button", { type: "button", onClick: () => removeLater(done.some((i) => i.recipes) ? "Usunięto kupione - produkty z przepisów są teraz w spiżarni" : "Usunięto kupione", done, [{ op: "clear", onlyChecked: true }]), children: "Usu\u0144 kupione" })), _jsx("button", { type: "button", className: "danger", onClick: () => removeLater("Wyczyszczono listę", items, [{ op: "clear", onlyChecked: false }]), children: "Wyczy\u015B\u0107 list\u0119" })] })] }))] }));
}
