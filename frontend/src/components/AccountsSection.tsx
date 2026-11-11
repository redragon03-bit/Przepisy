import { useEffect, useState } from "react";
import { Account, api, AuthStatus } from "../api";
import { useToast } from "../lib/toast";

/** Ustawienia → Konta. Właściciel dodaje domowników; domownik zmienia tu swoje hasło. */
export default function AccountsSection({ auth }: { auth: AuthStatus }) {
  return auth.is_owner ? <OwnerAccounts auth={auth} /> : <OwnPassword name={auth.user_name} />;
}

function OwnerAccounts({ auth }: { auth: AuthStatus }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  // Konto, które właśnie zmieniamy (id null = właściciel), i wpisywana wartość
  const [editing, setEditing] = useState<{
    id: number | null;
    field: "name" | "password";
    value: string;
  } | null>(null);
  const { toast, run } = useToast();

  useEffect(() => {
    if (auth.auth_required) api.listAccounts().then(setAccounts);
  }, [auth.auth_required]);

  if (!auth.auth_required) {
    return (
      <section className="box">
        <h2>Konta</h2>
        <p className="muted small">Konta dla domowników działają, gdy aplikacja ma hasło (opcja app_password dodatku).</p>
      </section>
    );
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const saved = await run(() => api.addAccount(name.trim(), password));
    if (saved) {
      setAccounts(saved);
      toast(`Dodano konto „${name.trim()}”. Przekaż mu nazwę i hasło.`);
      setName("");
      setPassword("");
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const { id, field, value } = editing;
    const saved = await run(() =>
      id === null ? api.renameOwner(value.trim()) : api.updateAccount(id, field === "name" ? { name: value.trim() } : { password: value }),
    );
    if (saved) {
      setAccounts(saved);
      setEditing(null);
      toast(field === "password" ? "Zmieniono hasło - na innych urządzeniach trzeba zalogować się od nowa." : "Zmieniono nazwę.");
    }
  };

  // Usunięcie kasuje plan, zakupy i spiżarnię domownika, więc tu (wyjątkowo) pytamy
  const remove = async (account: Account) => {
    if (account.id === null) return;
    if (
      !window.confirm(
        `Usunąć konto „${account.name}”? Jego plan, lista zakupów i spiżarnia znikną, a dodane przez niego przepisy zostaną u Ciebie.`,
      )
    )
      return;
    const saved = await run(() => api.deleteAccount(account.id as number));
    if (saved) setAccounts(saved);
  };

  return (
    <section className="box">
      <h2>Konta</h2>
      <p className="muted small">
        Przepisy są wspólne. Każde konto ma własny plan, listę zakupów, spiżarnię, ulubione i oceny. Domownik zmienia tylko przepisy, które
        sam dodał, i nie widzi kopii zapasowych ani Home Assistant.
      </p>
      <ul className="account-list">
        {accounts.map((a) => (
          <li key={a.id ?? "owner"}>
            {editing && editing.id === a.id ? (
              <form className="row" onSubmit={save}>
                <input
                  type={editing.field === "password" ? "password" : "text"}
                  value={editing.value}
                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                  placeholder={editing.field === "password" ? "Nowe hasło (min. 4 znaki)" : "Nazwa"}
                  autoComplete={editing.field === "password" ? "new-password" : "off"}
                  autoCapitalize="none"
                  autoFocus
                />
                <button className="primary">Zapisz</button>
                <button type="button" onClick={() => setEditing(null)}>
                  ✕
                </button>
              </form>
            ) : (
              <div className="row">
                <span className="grow">
                  <b>{a.name}</b> <span className="muted small">{a.is_owner ? "(Ty, właściciel)" : "(domownik)"}</span>
                </span>
                <button type="button" className="link small" onClick={() => setEditing({ id: a.id, field: "name", value: a.name })}>
                  Nazwa
                </button>
                {!a.is_owner && (
                  <>
                    <button type="button" className="link small" onClick={() => setEditing({ id: a.id, field: "password", value: "" })}>
                      Hasło
                    </button>
                    <button type="button" className="link small danger" onClick={() => remove(a)} aria-label={`Usuń konto ${a.name}`}>
                      Usuń
                    </button>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <form className="stack" onSubmit={add}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nazwa nowego konta, np. imię"
          autoCapitalize="none"
          autoComplete="off"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Hasło (min. 4 znaki)"
          autoComplete="new-password"
        />
        <button className="wide" disabled={!name.trim() || password.length < 4}>
          Dodaj konto
        </button>
      </form>
    </section>
  );
}

function OwnPassword({ name }: { name: string }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const { toast, run } = useToast();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run(() => api.changePassword(oldPassword, newPassword).then(() => true))) {
      setOldPassword("");
      setNewPassword("");
      toast("Zmieniono hasło.");
    }
  };

  return (
    <section className="box">
      <h2>Twoje konto</h2>
      <p className="muted small">
        Zalogowano jako <b>{name}</b>. Przepisy są wspólne z właścicielem aplikacji; plan, zakupy, spiżarnia, ulubione i oceny masz swoje.
      </p>
      <form className="stack" onSubmit={save}>
        <input
          type="password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          placeholder="Obecne hasło"
          autoComplete="current-password"
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Nowe hasło (min. 4 znaki)"
          autoComplete="new-password"
        />
        <button className="wide" disabled={!oldPassword || newPassword.length < 4}>
          Zmień hasło
        </button>
      </form>
    </section>
  );
}
