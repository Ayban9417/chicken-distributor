import { useState } from "react";
import { Eye, EyeOff, KeyRound, Pencil, UserCheck, UserPlus, UserX } from "lucide-react";
import { Badge, Button, Field, inputClass, ResponsiveTable, SectionHeader } from "./ui";
import { confirmedPasswordError, normalizeUsername, passwordError, usernameError } from "../utils/accounts";

function SecretField({ label, value, onChange }) {
  const [visible, setVisible] = useState(false);
  return <Field label={label}><div className="relative"><input className={`${inputClass()} pr-12`} type={visible ? "text" : "password"} autoComplete="new-password" value={value} onChange={(event) => onChange(event.target.value)} required /><button type="button" className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-500" aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} title={visible ? "Hide password" : "Show password"} onClick={() => setVisible((current) => !current)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></Field>;
}

function AccountEditor({ mode, account, onCancel, onSave }) {
  const creating = mode === "create";
  const resetting = mode === "reset";
  const [values, setValues] = useState({
    fullName: account?.name || "",
    username: account?.username || "",
    password: "",
    confirmPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    const validation = resetting
      ? passwordError(values.password) || confirmedPasswordError(values.password, values.confirmPassword)
      : usernameError(values.username) || (!values.fullName.trim() ? "Enter the Salesman's full name." : "") || (creating ? passwordError(values.password) || confirmedPasswordError(values.password, values.confirmPassword) : "");
    if (validation) return setError(validation);
    setBusy(true); setError("");
    try {
      const saved = await onSave({ ...values, fullName: values.fullName.trim(), username: normalizeUsername(values.username) });
      if (saved) onCancel();
    } catch (reason) {
      setError(reason?.message || "Account could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="report-section mb-5"><h2 className="mb-4 text-lg font-bold">{resetting ? `Reset Password: ${account.name}` : creating ? "Add Salesman" : "Edit Salesman"}</h2><form onSubmit={submit}>
    {!resetting && <div className="grid gap-3 sm:grid-cols-2"><Field label="Full Name"><input className={inputClass()} value={values.fullName} onChange={(event) => setValues({ ...values, fullName: event.target.value })} required /></Field><Field label="Username"><input className={inputClass()} autoComplete="off" value={values.username} onChange={(event) => setValues({ ...values, username: normalizeUsername(event.target.value) })} required /></Field></div>}
    {(creating || resetting) && <div className="mt-3 grid gap-3 sm:grid-cols-2"><SecretField label="Temporary Password" value={values.password} onChange={(value) => setValues({ ...values, password: value })} /><SecretField label="Confirm Password" value={values.confirmPassword} onChange={(value) => setValues({ ...values, confirmPassword: value })} /></div>}
    {error && <p role="alert" className="mt-3 border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-2"><Button disabled={busy}>{busy ? "Saving..." : resetting ? "Reset Password" : creating ? "Create Salesman" : "Save Changes"}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button></div>
  </form></section>;
}

export function SalesmanAccounts({ users, onCreate, onUpdate, onToggle, onReset }) {
  const [editor, setEditor] = useState(null);
  const salesmen = users.filter((user) => user.role === "Agent");
  return <>
    <SectionHeader title="Salesman Accounts" action={<Button onClick={() => setEditor({ mode: "create" })}><UserPlus size={17} />Add Salesman</Button>} />
    {editor && <AccountEditor key={`${editor.mode}-${editor.account?.id || "new"}`} mode={editor.mode} account={editor.account} onCancel={() => setEditor(null)} onSave={(values) => editor.mode === "create" ? onCreate(values) : editor.mode === "reset" ? onReset(editor.account, values) : onUpdate(editor.account, values)} />}
    <ResponsiveTable columns={["Full Name", "Username", "Status", "Actions"]} rows={salesmen.map((user) => [
      <div><strong>{user.name}</strong>{user.mustChangePassword && <p className="mt-1 text-xs font-semibold text-amber-700">Password change required</p>}</div>,
      user.username,
      <Badge tone={user.active ? "green" : "slate"}>{user.active ? "Active" : "Inactive"}</Badge>,
      <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setEditor({ mode: "edit", account: user })}><Pencil size={16} />Edit</Button><Button variant="secondary" onClick={() => setEditor({ mode: "reset", account: user })}><KeyRound size={16} />Reset Password</Button><Button variant="secondary" onClick={() => onToggle(user)}>{user.active ? <UserX size={16} /> : <UserCheck size={16} />}{user.active ? "Deactivate" : "Activate"}</Button></div>,
    ])} />
  </>;
}
