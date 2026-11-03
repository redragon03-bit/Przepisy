import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { api } from "../api";
export default function LoginPage({ onLogin }) {
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const submit = async (e) => {
        e.preventDefault();
        try {
            await api.login(password);
            onLogin();
        }
        catch {
            setError("Złe hasło");
        }
    };
    return (_jsxs("form", { className: "page login", onSubmit: submit, children: [_jsx("h1", { children: "\uD83C\uDF72 Przepisy" }), _jsx("input", { type: "password", value: password, onChange: (e) => setPassword(e.target.value), placeholder: "Has\u0142o", autoFocus: true }), error && _jsx("p", { className: "error", children: error }), _jsx("button", { className: "primary", children: "Zaloguj" })] }));
}
