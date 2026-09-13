import { useState } from "react";
import { Plus, Pencil, Save, Trash2, ArrowLeft } from "lucide-react";
import { Badge, Button, Field, inputClass, ResponsiveTable, SectionHeader } from "./ui";
import { configureProduct, isClassReferenced, isReferenced, optionLabel, productMaster, validatePlant } from "../utils/plants";

const id = () => crypto.randomUUID();
export function PlantManagement({ plants, setPlants, trips, role, addAudit, pushToast, onBack }) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [masterId, setMasterId] = useState(productMaster[0].productId);
  if (role !== "Owner / Admin") return null;
  const edit = (plant) => { setError(""); setDraft(structuredClone(plant)); };
  const updateProduct = (productId, patch) => setDraft((d) => ({ ...d, products: d.products.map((p) => p.productId === productId ? { ...p, ...patch } : p) }));
  function save() {
    const problem = validatePlant(draft, plants, trips);
    if (problem) return setError(problem);
    const plant = { ...draft, name: draft.name.trim(), originalName: draft.originalName || draft.name.trim(), shortCode: draft.shortCode.trim().toUpperCase(), products: draft.products.map((p) => ({ ...p, productName: p.productName.trim(), sizeCodes: (p.sizeCodes || []).map((c) => ({ ...c, id: c.id.trim().toUpperCase(), displayName: c.displayName.trim() })), classTypes: (p.classTypes || []).map((c) => ({ ...c, id: c.id.trim().toUpperCase(), displayName: c.displayName.trim() })) })) };
    setPlants((items) => items.some((p) => p.id === plant.id) ? items.map((p) => p.id === plant.id ? plant : p) : [...items, plant]);
    addAudit("Saved plant configuration: " + plant.name, role); setDraft(null); pushToast("Plant configuration saved");
  }
  return <div className="plant-management">
    <Button variant="ghost" onClick={onBack}><ArrowLeft size={17} />Administration</Button>
    <SectionHeader title="Manage Plants" action={!draft && <Button onClick={() => edit({ id: id(), name: "", originalName: "", shortCode: "", active: true, accent: "#15803d", products: [] })}><Plus size={17} />Add Plant</Button>} />
    {draft ? <section className="report-section">
      <h2 className="mb-4 text-lg font-bold">{plants.some((p) => p.id === draft.id) ? "Edit Plant" : "Add Plant"}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Plant Name"><input className={inputClass()} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
        <Field label="Short Code"><input className={inputClass()} value={draft.shortCode} onChange={(e) => setDraft({ ...draft, shortCode: e.target.value })} /></Field>
        <Field label="Accent Color"><input type="color" className="h-11 w-16 cursor-pointer" value={draft.accent} onChange={(e) => setDraft({ ...draft, accent: e.target.value })} /></Field>
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />Plant Active</label>
      </div>
      <h3 className="mt-6 text-lg font-bold">Products</h3>
      {draft.products.map((p) => <fieldset key={p.productId} className="mt-4 border-t border-slate-200 py-4">
        <legend className="font-bold">{p.productName || "New Product"}</legend>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Product Name"><input className={inputClass()} value={p.productName} onChange={(e) => updateProduct(p.productId, { productName: e.target.value })} /></Field>
          <Field label="Category"><select className={inputClass()} value={p.category} onChange={(e) => updateProduct(p.productId, { category: e.target.value })}><option>Whole Chicken</option><option>By-products</option></select></Field>
          <Field label="Default Unit"><select className={inputClass()} value={p.defaultUnit} onChange={(e) => updateProduct(p.productId, { defaultUnit: e.target.value })}><option value="kg">kg</option></select></Field>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={p.active} onChange={(e) => updateProduct(p.productId, { active: e.target.checked })} />Product Active</label>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={p.usesSizeCodes} onChange={(e) => updateProduct(p.productId, { usesSizeCodes: e.target.checked })} />Uses Size Codes</label>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={p.usesClassTypes || false} onChange={(e) => updateProduct(p.productId, { usesClassTypes: e.target.checked })} />Uses Class Types</label>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={p.usesBags || false} onChange={(e) => updateProduct(p.productId, { usesBags: e.target.checked })} />Track Bags</label>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={p.usesHeadCount || false} onChange={(e) => updateProduct(p.productId, { usesHeadCount: e.target.checked })} />Track Head Count</label>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={p.allowsFreeFromPlant} onChange={(e) => updateProduct(p.productId, { allowsFreeFromPlant: e.target.checked })} />Allows Free from Plant</label>
          <Field label="Product Notes"><input className={inputClass()} value={p.notes} onChange={(e) => updateProduct(p.productId, { notes: e.target.value })} /></Field>
        </div>
        {p.usesSizeCodes && <div className="mt-3 space-y-3">{(p.sizeCodes || []).map((c, codeIndex) => <div key={codeIndex} className="flex flex-wrap items-end gap-3">
          <Field label="Operational Code"><input className={inputClass()} value={c.id} disabled={isReferenced(trips, draft, p, c)} title={isReferenced(trips, draft, p, c) ? "Used in a Trip; edit the display label or deactivate it instead." : ""} onChange={(e) => updateProduct(p.productId, { sizeCodes: p.sizeCodes.map((code, index) => index === codeIndex ? { ...code, id: e.target.value } : code) })} /></Field>
          <Field label="Display Label"><input className={inputClass()} value={c.displayName} onChange={(e) => updateProduct(p.productId, { sizeCodes: p.sizeCodes.map((code, index) => index === codeIndex ? { ...code, displayName: e.target.value } : code) })} /></Field>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={c.active} onChange={(e) => updateProduct(p.productId, { sizeCodes: p.sizeCodes.map((code) => code.id === c.id ? { ...code, active: e.target.checked } : code) })} />Code Active</label>
          <Button variant="ghost" aria-label={"Remove code " + (c.id || "unnamed")} title={isReferenced(trips, draft, p, c) ? "Used in a Trip: deactivate instead" : "Remove unused code"} disabled={isReferenced(trips, draft, p, c)} onClick={() => updateProduct(p.productId, { sizeCodes: p.sizeCodes.filter((_, index) => index !== codeIndex) })}><Trash2 size={17} /></Button>
        </div>)}<Button variant="secondary" disabled={p.sizeCodes.some((c) => !c.id.trim())} onClick={() => updateProduct(p.productId, { sizeCodes: [...p.sizeCodes, { id: "", displayName: "", active: true }] })}><Plus size={17} />Add Code</Button></div>}
        {p.usesClassTypes && <div className="mt-3 space-y-3"><p className="font-bold">Class Types</p>{(p.classTypes || []).map((c, classIndex) => <div key={classIndex} className="flex flex-wrap items-end gap-3"><Field label="Class Type"><input className={inputClass()} value={c.id} disabled={isClassReferenced(trips, draft, p, c)} title={isClassReferenced(trips, draft, p, c) ? "Used in a Trip; edit the display label or deactivate it instead." : ""} onChange={(e) => updateProduct(p.productId, { classTypes: p.classTypes.map((item, index) => index === classIndex ? { ...item, id: e.target.value } : item) })} /></Field><Field label="Display Label"><input className={inputClass()} value={c.displayName} onChange={(e) => updateProduct(p.productId, { classTypes: p.classTypes.map((item, index) => index === classIndex ? { ...item, displayName: e.target.value } : item) })} /></Field><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={c.active} onChange={(e) => updateProduct(p.productId, { classTypes: p.classTypes.map((item, index) => index === classIndex ? { ...item, active: e.target.checked } : item) })} />Class Active</label><Button variant="ghost" aria-label={"Remove class " + (c.id || "unnamed")} title={isClassReferenced(trips, draft, p, c) ? "Used in a Trip: deactivate instead" : "Remove unused class"} disabled={isClassReferenced(trips, draft, p, c)} onClick={() => updateProduct(p.productId, { classTypes: p.classTypes.filter((_, index) => index !== classIndex) })}><Trash2 size={17} /></Button></div>)}<Button variant="secondary" disabled={(p.classTypes || []).some((c) => !c.id.trim())} onClick={() => updateProduct(p.productId, { classTypes: [...(p.classTypes || []), { id: "", displayName: "", active: true }] })}><Plus size={17} />Add Class Type</Button></div>}
        <Button className="mt-3" variant="ghost" disabled={isReferenced(trips, draft, p)} title={isReferenced(trips, draft, p) ? "Used in a Trip: deactivate instead" : "Remove unused product"} onClick={() => setDraft({ ...draft, products: draft.products.filter((item) => item.productId !== p.productId) })}><Trash2 size={17} />Remove Product</Button>
      </fieldset>)}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Product Master"><select className={inputClass()} value={masterId} onChange={(e) => setMasterId(e.target.value)}>{productMaster.map((p) => <option key={p.productId} value={p.productId}>{p.productName}</option>)}<option value="custom">Custom Product</option></select></Field>
        <Button variant="secondary" disabled={draft.products.some((p) => p.productId === masterId || !p.productName.trim())} onClick={() => setDraft({ ...draft, products: [...draft.products, configureProduct(masterId === "custom" ? { productId: id(), productName: "", category: "By-products" } : productMaster.find((p) => p.productId === masterId))] })}><Plus size={17} />Add Product</Button>
      </div>
      {error && <p role="alert" className="mt-4 text-rose-700">{error}</p>}
      <div className="mt-6 flex gap-3"><Button onClick={save}><Save size={17} />Save Plant</Button><Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button></div>
    </section> : <ResponsiveTable columns={["Plant", "Short Code", "Products", "Status", "Actions"]} rows={plants.map((plant) => [<span className="flex items-center gap-2 font-bold"><span className="h-3 w-3 shrink-0 rounded-full" style={{ background: plant.accent }} />{plant.name}</span>, plant.shortCode,
      plant.products.filter((p) => p.active).map((p) => p.productName + (p.usesSizeCodes ? " (" + p.sizeCodes.filter((c) => c.active).map(optionLabel).join(", ") + ")" : "") + (p.usesClassTypes ? " / " + p.classTypes.filter((c) => c.active).map(optionLabel).join(", ") : "")).join("; ") || "No active products",
      <Badge tone={plant.active ? "green" : "slate"}>{plant.active ? "Active" : "Inactive"}</Badge>, <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => edit(plant)}><Pencil size={16} />Edit {plant.name}</Button><Button variant="secondary" onClick={() => { setPlants((items) => items.map((p) => p.id === plant.id ? { ...p, active: !p.active } : p)); addAudit((plant.active ? "Deactivated plant: " : "Activated plant: ") + plant.name, role); }}>{plant.active ? "Deactivate" : "Activate"}</Button></div>])} />}
  </div>;
}
