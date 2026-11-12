import { useEffect, useState } from "react";
import { api, PantryItem, ReceiptLine, ReceiptScan } from "../api";
import { useToast } from "../lib/toast";
import { inDays } from "./ExpirySheet";
import Sheet from "./Sheet";

const POLL_MS = 2500;
// Dłużej nie czekamy (AI w tle ma swoje limity czasu, to tylko zabezpieczenie)
const GIVE_UP_MS = 5 * 60_000;

interface Row extends ReceiptLine {
  on: boolean;
}

function amountLabel(line: ReceiptLine): string {
  if (line.amount === null) return "";
  return `${String(line.amount).replace(".", ",")} ${line.unit}`.trim();
}

// Paragon -> spiżarnia: zdjęcie idzie do AI (w tle), potem sprawdzasz listę i dodajesz zaznaczone.
// Zaznaczone jest jedzenie z rozpoznaną nazwą; nazwę można poprawić - aplikacja ją zapamięta.
export default function ReceiptSheet({ files, onDone, onClose }: {
  files: File[];
  onDone: (items: PantryItem[]) => void;
  onClose: () => void;
}) {
  const [scan, setScan] = useState<ReceiptScan | null>(null);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const follow = (current: ReceiptScan) => {
      if (!alive) return;
      setScan(current);
      if (current.status === "running") {
        if (Date.now() - started > GIVE_UP_MS) {
          setError("Odczyt trwa zbyt długo - spróbuj jeszcze raz za chwilę.");
          return;
        }
        timer = setTimeout(() => api.receiptScan(current.id).then(follow, (e: Error) => alive && setError(e.message)), POLL_MS);
      } else if (current.status === "failed") {
        setError(current.error);
      } else {
        setRows(current.items.map((line) => ({ ...line, on: line.food && !!line.name })));
      }
    };
    api.scanReceipt(files).then(follow, (e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [files]);

  const update = (index: number, change: Partial<Row>) => setRows(rows.map((r, i) => (i === index ? { ...r, ...change } : r)));
  const chosen = rows.filter((r) => r.on && r.name.trim());

  const save = async () => {
    setSaving(true);
    try {
      const items = await api.applyReceipt(
        scan?.store ?? "",
        chosen.map((r) => ({ raw: r.raw, name: r.name.trim(), expires: r.days ? inDays(r.days) : null })),
      );
      toast(`Dodano do spiżarni: ${chosen.length}`);
      onDone(items);
    } catch (e) {
      toast((e as Error).message);
      setSaving(false);
    }
  };

  const title = scan?.store ? `Z paragonu · ${scan.store}` : "Z paragonu";
  return (
    <Sheet title={title} onClose={onClose} list>
      {error ? (
        <>
          <p className="box warning small">{error}</p>
          <button type="button" className="wide" onClick={onClose}>
            Zamknij
          </button>
        </>
      ) : !scan || scan.status === "running" ? (
        <p className="muted center receipt-wait">
          <span className="typing" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Czytam paragon… to trwa zwykle 10-30 sekund.
        </p>
      ) : (
        <>
          <p className="muted small">Sprawdź listę: odznacz to, czego nie chcesz, i popraw nazwy. Aplikacja zapamięta poprawki na następny paragon.</p>
          <ul className="receipt-list">
            {rows.map((row, index) => (
              <li key={index} className={row.on ? "" : "off"}>
                <input
                  type="checkbox"
                  checked={row.on}
                  onChange={(e) => update(index, { on: e.target.checked })}
                  aria-label={`Dodaj ${row.name || row.raw}`}
                />
                <span className="grow">
                  <input
                    className={`receipt-name ${row.name ? "" : "unknown"}`}
                    value={row.name}
                    placeholder="? wpisz, co to za produkt"
                    onChange={(e) => update(index, { name: e.target.value, on: !!e.target.value.trim() })}
                    autoCapitalize="none"
                    enterKeyHint="done"
                  />
                  <span className="muted small block">
                    {row.raw}
                    {amountLabel(row) && ` · ${amountLabel(row)}`}
                    {!row.food && " · nie jedzenie"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className="wide primary" disabled={!chosen.length || saving} onClick={save}>
            Dodaj {chosen.length} do spiżarni
          </button>
        </>
      )}
    </Sheet>
  );
}
