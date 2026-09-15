import { useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { Button, Field, inputClass } from "./ui";
import { readableError } from "../services/errors";

export function AuthScreen({ onSignIn, configurationError = "" }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(configurationError);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSignIn(username, password);
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
          <Field label="Username"><input autoComplete="username" className={inputClass()} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} required /></Field>
          <Field label="Password"><div className="relative"><input autoComplete="current-password" type={showPassword ? "text" : "password"} className={`${inputClass()} pr-12`} value={password} onChange={(e) => setPassword(e.target.value)} required /><button type="button" className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-500" aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></Field>
        </div>
        {error && <p role="alert" className="mt-4 border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
        <Button className="mt-5 w-full justify-center" disabled={busy || Boolean(configurationError)}>
          <LogIn size={17} />{busy ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
