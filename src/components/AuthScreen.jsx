import { useState } from "react";
import { LogIn } from "lucide-react";
import { Button, Field, inputClass } from "./ui";
import { readableError } from "../services/errors";

export function AuthScreen({ onSignIn, configurationError = "" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(configurationError);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSignIn(email.trim(), password);
    } catch (reason) {
      setError(readableError(reason, "Sign in failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-5">
      <form onSubmit={submit} className="w-full max-w-md border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 border-b border-slate-200 pb-5">
          <p className="text-sm font-bold uppercase text-emerald-700">Chicken Distributor</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Sign in</h1>
          <p className="mt-2 text-sm text-slate-600">Use your assigned business account.</p>
        </div>
        <div className="space-y-4">
          <Field label="Email"><input autoComplete="email" type="email" className={inputClass()} value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Password"><input autoComplete="current-password" type="password" className={inputClass()} value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        </div>
        {error && <p role="alert" className="mt-4 border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
        <Button className="mt-5 w-full justify-center" disabled={busy || Boolean(configurationError)}>
          <LogIn size={17} />{busy ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
