import { useState, useEffect, useContext, useRef, createContext } from "react";
import { X } from "lucide-react";
export const UserContext = createContext([]);
export const useUsers = () => useContext(UserContext);
export const PlantContext = createContext([]);

export function Badge({ children, tone = "slate" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    red: "bg-rose-50 text-rose-700 ring-rose-200",
    purple: "bg-violet-50 text-violet-700 ring-violet-200",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tones[tone]}`}>{children}</span>;
}

export function Button({ children, variant = "primary", className = "", ...props }) {
  const variants = {
    primary: "bg-[#146ef5] text-white hover:bg-blue-700",
    secondary: "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
  };
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export function inputClass() {
  return "min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
}

export function StatCard({ label, value, detail, tone = "blue", icon: Icon }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
          {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
        </div>
        {Icon && (
          <div className={`rounded-lg p-2 ${tone === "red" ? "bg-rose-50 text-rose-600" : tone === "green" ? "bg-emerald-50 text-emerald-600" : tone === "amber" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>
            <Icon size={20} />
          </div>
        )}
      </div>
    </div>
  );
}

export function Drawer({ title, children, onClose }) {
  const panel = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector("button")?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  function handleKey(event) {
    if (event.key === "Escape") onClose();
    if (event.key !== "Tab") return;
    const controls = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')];
    if (!controls.length) return;
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  if (!children) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/25">
      <button className="flex-1" tabIndex={-1} aria-label="Close drawer" onClick={onClose} />
      <aside ref={panel} role="dialog" aria-modal="true" aria-label={title} onKeyDown={handleKey} className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-950">{title}</h2>
          <Button variant="ghost" className="h-11 w-11 px-0" onClick={onClose} aria-label="Close">
            <X size={20} />
          </Button>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function SectionHeader({ title, eyebrow, action }) {
  return (
    <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <div>
        {eyebrow && <p className="mb-1 text-sm font-semibold text-[#146ef5]">{eyebrow}</p>}
        <h1 className="text-2xl font-extrabold uppercase text-slate-950 md:text-3xl">{title}</h1>
      </div>
      {action}
    </div>
  );
}

export function ResponsiveTable({ columns, rows, footer }) {
  if (!rows.length) return <p className="border-y border-slate-200 py-5 text-sm text-slate-500">No records in this selection.</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>{columns.map((column) => <th key={column} className="px-3 py-3 font-bold">{column}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3">{cell}</td>)}</tr>)}
          </tbody>
          {footer && <tfoot className="bg-slate-950 text-sm font-bold text-white"><tr>{footer.map((cell, index) => <td key={index} className="px-3 py-3">{cell}</td>)}</tr></tfoot>}
        </table>
      </div>
      <div className="divide-y divide-slate-100 md:hidden">
        {[...rows, ...(footer ? [footer] : [])].map((row, rowIndex) => (
          <div key={rowIndex} className="p-3">
            {row.map((cell, cellIndex) => (
              <div key={cellIndex} className="mb-2 flex justify-between gap-3 text-sm">
                <span className="font-semibold text-slate-500">{columns[cellIndex]}</span>
                <span className="text-right font-semibold">{cell}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatMini({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-slate-950">{value}</p>
    </div>
  );
}

export function Info({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <strong className="text-right text-slate-900">{value}</strong>
    </div>
  );
}


export function MoneyInput({ value, onChange, className = inputClass(), ...props }) {
  const format = (number) => number === "" ? "" : Number(number || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 });
  const [text, setText] = useState(format(value));
  useEffect(() => { setText(format(value)); }, [value]);
  return <input {...props} className={className} type="text" inputMode="decimal" value={text}
    onChange={(event) => {
      const raw = event.target.value.replaceAll(",", "");
      if (!/^[0-9]*([.][0-9]{0,2})?$/.test(raw)) return;
      if (raw === ".") { setText("0."); onChange({ target: { value: 0 } }); return; }
      setText(raw);
      onChange({ target: { value: raw === "" ? "" : Number(raw) } });
    }}
    onBlur={() => setText(value === "" ? "" : Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: text.includes(".") ? 2 : 0, maximumFractionDigits: 2 }))} />;
}
export function DateRange({ range, setRange }) {
  return <fieldset className="date-range"><legend className="text-sm font-bold text-slate-600">Date Range</legend>
    <Field label="Start Date"><input className={inputClass()} type="date" value={range.start} max={range.end} onInput={(e) => e.target.value && setRange({ ...range, start: e.target.value })} /></Field>
    <Field label="End Date"><input className={inputClass()} type="date" value={range.end} min={range.start} onInput={(e) => e.target.value && setRange({ ...range, end: e.target.value })} /></Field>
    {range.start > range.end && <p role="alert" className="text-rose-700">End Date must follow Start Date.</p>}
  </fieldset>;
}
export function PlantName({ name }) {
  const plants = useContext(PlantContext);
  const plant = plants.find((p) => p.name === name || p.originalName === name);
  return <span className="plant-name" data-plant={name} style={{ borderColor: plant?.accent }}>{name}</span>;
}
