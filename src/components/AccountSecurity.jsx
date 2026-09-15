import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound } from "lucide-react";
import { Button, Field, inputClass } from "./ui";
import { confirmedPasswordError, passwordError } from "../utils/accounts";

function PasswordInput({ label, value, onChange, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return <Field label={label}><div className="relative"><input className={`${inputClass()} pr-12`} type={visible ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} required /><button type="button" className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-500" aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} title={visible ? "Hide password" : "Show password"} onClick={() => setVisible((current) => !current)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></Field>;
}

export function ChangePasswordForm({ onChangePassword, onDone, forced = false }) {
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const validation = passwordError(values.newPassword) || confirmedPasswordError(values.newPassword, values.confirmPassword);
    if (validation) return setError(validation);
    if (!values.currentPassword) return setError("Enter your current password.");
    setBusy(true); setError("");
    try {
      await onChangePassword(values);
      setValues({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setChanged(true);
    } catch (reason) {
      setError(reason?.message || "Password could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  if (changed) return <div role="status" className="border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"><div className="flex items-center gap-2 font-bold"><CheckCircle2 size={19} />Password changed successfully.</div><Button className="mt-4" onClick={onDone}>{forced ? "Continue" : "Done"}</Button></div>;

  return <form onSubmit={submit} className="space-y-4">
    <PasswordInput label="Current Password" autoComplete="current-password" value={values.currentPassword} onChange={(value) => setValues({ ...values, currentPassword: value })} />
    <PasswordInput label="New Password" autoComplete="new-password" value={values.newPassword} onChange={(value) => setValues({ ...values, newPassword: value })} />
    <PasswordInput label="Confirm New Password" autoComplete="new-password" value={values.confirmPassword} onChange={(value) => setValues({ ...values, confirmPassword: value })} />
    {error && <p role="alert" className="border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
    <Button disabled={busy} className="w-full"><KeyRound size={17} />{busy ? "Changing..." : "Change Password"}</Button>
  </form>;
}
