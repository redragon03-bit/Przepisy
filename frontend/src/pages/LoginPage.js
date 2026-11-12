import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { api } from "../api";
export default function LoginPage({ onLogin }) {
    const [name, setName] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const submit = async (e) => {
        e.preventDefault();
        try {
            await api.login(name, password);
            onLogin();
        }
        catch (err) {
            setError(err instanceof Error && err.message.startsWith("Za dużo") ? err.message : "Zła nazwa albo hasło");
        }
    };
    return (_jsxs("form", { className: "page login", onSubmit: submit, children: [_jsx("h1", { children: "\uD83C\uDF72 Przepisy" }), _jsx("input", { value: name, onChange: (e) => setName(e.target.value), placeholder: "Nazwa konta", autoComplete: "username", autoCapitalize: "none", autoFocus: true }), _jsx("input", { type: "password", value: password, onChange: (e) => setPassword(e.target.value), placeholder: "Has\u0142o", autoComplete: "current-password" }), error && _jsx("p", { className: "error", children: error }), _jsx("button", { className: "primary", children: "Zaloguj" })] }));
}
