import { useState } from "react";
import { api } from "../api";

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.login(name, password);
      onLogin();
    } catch (err) {
      setError(err instanceof Error && err.message.startsWith("Za dużo") ? err.message : "Zła nazwa albo hasło");
    }
  };

  return (
    <form className="page login" onSubmit={submit}>
      <h1>🐉 Smocza strawa</h1>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nazwa konta"
        autoComplete="username"
        autoCapitalize="none"
        autoFocus
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Hasło"
        autoComplete="current-password"
      />
      {error && <p className="error">{error}</p>}
      <button className="primary">Zaloguj</button>
    </form>
  );
}
