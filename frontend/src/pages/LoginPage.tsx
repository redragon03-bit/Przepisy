import { useState } from "react";
import { api } from "../api";

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.login(password);
      onLogin();
    } catch {
      setError("Złe hasło");
    }
  };

  return (
    <form className="page login" onSubmit={submit}>
      <h1>🍲 Przepisy</h1>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Hasło" autoFocus />
      {error && <p className="error">{error}</p>}
      <button className="primary">Zaloguj</button>
    </form>
  );
}
