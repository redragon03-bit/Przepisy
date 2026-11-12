import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useToast } from "../lib/toast";
/** Ustawienia → Konta. Właściciel dodaje domowników; domownik zmienia tu swoje hasło. */
export default function AccountsSection({ auth }) {
    return auth.is_owner ? _jsx(OwnerAccounts, { auth: auth }) : _jsx(OwnPassword, { name: auth.user_name });
}
function OwnerAccounts({ auth }) {
    const [accounts, setAccounts] = useState([]);
    const [name, setName] = useState("");
    const [password, setPassword] = useState("");
    // Konto, które właśnie zmieniamy (id null = właściciel), i wpisywana wartość
    const [editing, setEditing] = useState(null);
    const { toast, run } = useToast();
    useEffect(() => {
        if (auth.auth_required)
            api.listAccounts().then(setAccounts);
    }, [auth.auth_required]);
    if (!auth.auth_required) {
        return (_jsxs("section", { className: "box", children: [_jsx("h2", { children: "Konta" }), _jsx("p", { className: "muted small", children: "Konta dla domownik\u00F3w dzia\u0142aj\u0105, gdy aplikacja ma has\u0142o (opcja app_password dodatku)." })] }));
    }
    const add = async (e) => {
        e.preventDefault();
        const saved = await run(() => api.addAccount(name.trim(), password));
        if (saved) {
            setAccounts(saved);
            toast(`Dodano konto „${name.trim()}”. Przekaż mu nazwę i hasło.`);
            setName("");
            setPassword("");
        }
    };
    const save = async (e) => {
        e.preventDefault();
        if (!editing)
            return;
        const { id, field, value } = editing;
        const saved = await run(() => id === null ? api.renameOwner(value.trim()) : api.updateAccount(id, field === "name" ? { name: value.trim() } : { password: value }));
        if (saved) {
            setAccounts(saved);
            setEditing(null);
            toast(field === "password" ? "Zmieniono hasło - na innych urządzeniach trzeba zalogować się od nowa." : "Zmieniono nazwę.");
        }
    };
    // Usunięcie kasuje plan, zakupy i spiżarnię domownika, więc tu (wyjątkowo) pytamy
    const remove = async (account) => {
        if (account.id === null)
            return;
        if (!window.confirm(`Usunąć konto „${account.name}”? Jego plan, lista zakupów i spiżarnia znikną, a dodane przez niego przepisy zostaną u Ciebie.`))
            return;
        const saved = await run(() => api.deleteAccount(account.id));
        if (saved)
            setAccounts(saved);
    };
    return (_jsxs("section", { className: "box", children: [_jsx("h2", { children: "Konta" }), _jsx("p", { className: "muted small", children: "Przepisy s\u0105 wsp\u00F3lne. Ka\u017Cde konto ma w\u0142asny plan, list\u0119 zakup\u00F3w, spi\u017Carni\u0119, ulubione i oceny. Domownik zmienia tylko przepisy, kt\u00F3re sam doda\u0142, i nie widzi kopii zapasowych ani Home Assistant." }), _jsx("ul", { className: "account-list", children: accounts.map((a) => (_jsx("li", { children: editing && editing.id === a.id ? (_jsxs("form", { className: "row", onSubmit: save, children: [_jsx("input", { type: editing.field === "password" ? "password" : "text", value: editing.value, onChange: (e) => setEditing({ ...editing, value: e.target.value }), placeholder: editing.field === "password" ? "Nowe hasło (min. 4 znaki)" : "Nazwa", autoComplete: editing.field === "password" ? "new-password" : "off", autoCapitalize: "none", autoFocus: true }), _jsx("button", { className: "primary", children: "Zapisz" }), _jsx("button", { type: "button", onClick: () => setEditing(null), children: "\u2715" })] })) : (_jsxs("div", { className: "row", children: [_jsxs("span", { className: "grow", children: [_jsx("b", { children: a.name }), " ", _jsx("span", { className: "muted small", children: a.is_owner ? "(Ty, właściciel)" : "(domownik)" })] }), _jsx("button", { type: "button", className: "link small", onClick: () => setEditing({ id: a.id, field: "name", value: a.name }), children: "Nazwa" }), !a.is_owner && (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "link small", onClick: () => setEditing({ id: a.id, field: "password", value: "" }), children: "Has\u0142o" }), _jsx("button", { type: "button", className: "link small danger", onClick: () => remove(a), "aria-label": `Usuń konto ${a.name}`, children: "Usu\u0144" })] }))] })) }, a.id ?? "owner"))) }), _jsxs("form", { className: "stack", onSubmit: add, children: [_jsx("input", { value: name, onChange: (e) => setName(e.target.value), placeholder: "Nazwa nowego konta, np. imi\u0119", autoCapitalize: "none", autoComplete: "off" }), _jsx("input", { type: "password", value: password, onChange: (e) => setPassword(e.target.value), placeholder: "Has\u0142o (min. 4 znaki)", autoComplete: "new-password" }), _jsx("button", { className: "wide", disabled: !name.trim() || password.length < 4, children: "Dodaj konto" })] })] }));
}
function OwnPassword({ name }) {
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const { toast, run } = useToast();
    const save = async (e) => {
        e.preventDefault();
        if (await run(() => api.changePassword(oldPassword, newPassword).then(() => true))) {
            setOldPassword("");
            setNewPassword("");
            toast("Zmieniono hasło.");
        }
    };
    return (_jsxs("section", { className: "box", children: [_jsx("h2", { children: "Twoje konto" }), _jsxs("p", { className: "muted small", children: ["Zalogowano jako ", _jsx("b", { children: name }), ". Przepisy s\u0105 wsp\u00F3lne z w\u0142a\u015Bcicielem aplikacji; plan, zakupy, spi\u017Carnia, ulubione i oceny masz swoje."] }), _jsxs("form", { className: "stack", onSubmit: save, children: [_jsx("input", { type: "password", value: oldPassword, onChange: (e) => setOldPassword(e.target.value), placeholder: "Obecne has\u0142o", autoComplete: "current-password" }), _jsx("input", { type: "password", value: newPassword, onChange: (e) => setNewPassword(e.target.value), placeholder: "Nowe has\u0142o (min. 4 znaki)", autoComplete: "new-password" }), _jsx("button", { className: "wide", disabled: !oldPassword || newPassword.length < 4, children: "Zmie\u0144 has\u0142o" })] })] }));
}
