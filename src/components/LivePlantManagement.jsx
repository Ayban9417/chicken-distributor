import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, Plus, RefreshCw, Save } from "lucide-react";
import { Badge, Button, Field, inputClass, ResponsiveTable, SectionHeader } from "./ui";
import { createProduct, loadPlantConfiguration, saveClassType, saveCode, savePlant, savePlantProduct } from "../services/plantsService";
import { readableError } from "../services/errors";

const emptyPlant = () => ({ name: "", short_code: "", accent: "#15803d", active: true });
const emptyLink = (productId) => ({
  product_id: productId,
  active: true,
  uses_size_codes: false,
  uses_class_types: false,
  uses_bags: false,
  uses_head_count: false,
  allows_free_from_plant: false,
  notes: "",
  codes: [],
  classTypes: [],
});

export function LivePlantManagement({ organizationId, role, onBack }) {
  const [data, setData] = useState({ plants: [], products: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState(null);
  const [productDraft, setProductDraft] = useState({ name: "", category: "by_product" });
  const canManage = role === "owner_admin";

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setData(await loadPlantConfiguration(organizationId));
    } catch (reason) {
      setError(readableError(reason, "Unable to load Plant configuration."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [organizationId]);
  const configuredIds = useMemo(() => new Set((draft?.products || []).map((item) => item.product_id)), [draft]);

  function edit(plant) {
    setError("");
    setNotice("");
    setDraft(plant ? structuredClone(plant) : { ...emptyPlant(), products: [] });
  }

  function updateLink(index, patch) {
    setDraft((current) => ({
      ...current,
      products: current.products.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  }

  async function persistPlant() {
    if (!draft.name.trim() || !draft.short_code.trim()) return setError("Plant Name and Short Code are required.");
    setLoading(true);
    setError("");
    try {
      const plant = await savePlant(organizationId, draft);
      for (const link of draft.products) {
        const savedLink = await savePlantProduct(plant.id, link);
        for (const code of link.codes || []) if (code.code?.trim()) await saveCode(savedLink.id, code);
        for (const item of link.classTypes || []) if (item.class_type?.trim()) await saveClassType(savedLink.id, item);
      }
      setNotice("Plant configuration saved.");
      setDraft(null);
      await refresh();
    } catch (reason) {
      setError(readableError(reason, "Unable to save Plant configuration."));
      setLoading(false);
    }
  }

  async function addProductMaster() {
    if (!productDraft.name.trim()) return setError("Product Name is required.");
    setLoading(true);
    setError("");
    try {
      await createProduct(organizationId, productDraft);
      setProductDraft({ name: "", category: "by_product" });
      setNotice("Product master added.");
      await refresh();
    } catch (reason) {
      setError(readableError(reason, "Unable to add Product."));
      setLoading(false);
    }
  }

  if (!canManage) {
    return <div><SectionHeader title="Plant Configuration" action={<Button variant="secondary" onClick={refresh} disabled={loading}><RefreshCw size={16} />Refresh</Button>} />
      {error && <p role="alert" className="mb-4 border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800">{error}</p>}
      {loading ? <p className="py-10 text-center text-slate-500">Loading Plant configuration...</p> : <section className="report-section"><p className="mb-4 text-slate-600">Your role has read-only access to Plant configuration.</p><PlantRows plants={data.plants} /></section>}
    </div>;
  }

  return <div>
    {onBack && <Button variant="ghost" onClick={onBack}><ArrowLeft size={17} />Administration</Button>}
    <SectionHeader title="Manage Plants" action={<div className="flex gap-2"><Button variant="secondary" onClick={refresh} disabled={loading}><RefreshCw size={16} />Refresh</Button>{!draft && <Button onClick={() => edit(null)}><Plus size={17} />Add Plant</Button>}</div>} />
    {error && <p role="alert" className="mb-4 border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800">{error}</p>}
    {notice && <p className="mb-4 border border-emerald-200 bg-emerald-50 p-3 font-semibold text-emerald-800">{notice}</p>}
    {loading && !draft ? <p className="py-10 text-center text-slate-500">Loading Plant configuration...</p> : draft ? (
      <section className="report-section">
        <h2 className="mb-4 text-lg font-bold">{draft.id ? "Edit Plant" : "Add Plant"}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Plant Name"><input className={inputClass()} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
          <Field label="Short Code"><input className={inputClass()} value={draft.short_code} onChange={(e) => setDraft({ ...draft, short_code: e.target.value })} /></Field>
          <Field label="Accent Color"><input type="color" className="h-11 w-16 cursor-pointer" value={draft.accent || "#15803d"} onChange={(e) => setDraft({ ...draft, accent: e.target.value })} /></Field>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />Plant Active</label>
        </div>
        <h3 className="mt-6 text-lg font-bold">Configured Products</h3>
        {(draft.products || []).map((link, index) => <ProductConfiguration key={link.id || link.product_id} link={link} index={index} update={updateLink} />)}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Add Product"><select id="plant-product-select" className={inputClass()} defaultValue=""><option value="">Select Product</option>{data.products.filter((product) => !configuredIds.has(product.id)).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field>
          <Button variant="secondary" onClick={() => {
            const productId = document.getElementById("plant-product-select").value;
            if (productId) setDraft({ ...draft, products: [...draft.products, { ...emptyLink(productId), product: data.products.find((item) => item.id === productId) }] });
          }}><Plus size={17} />Configure Product</Button>
        </div>
        <div className="mt-6 flex gap-3"><Button onClick={persistPlant} disabled={loading}><Save size={17} />{loading ? "Saving..." : "Save Plant"}</Button><Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button></div>
      </section>
    ) : <PlantRows plants={data.plants} onEdit={edit} />}
    {!draft && <section className="report-section mt-5">
      <h2 className="mb-4 text-lg font-bold">Product Master</h2>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Product Name"><input className={inputClass()} value={productDraft.name} onChange={(e) => setProductDraft({ ...productDraft, name: e.target.value })} /></Field>
        <Field label="Category"><select className={inputClass()} value={productDraft.category} onChange={(e) => setProductDraft({ ...productDraft, category: e.target.value })}><option value="whole_chicken">Whole Chicken</option><option value="by_product">By-product</option><option value="other">Other</option></select></Field>
        <Button variant="secondary" onClick={addProductMaster} disabled={loading}><Plus size={17} />Add Product</Button>
      </div>
    </section>}
  </div>;
}

function PlantRows({ plants, onEdit }) {
  if (!plants.length) return <p className="py-8 text-center text-slate-500">No Plants configured.</p>;
  return <ResponsiveTable columns={["Plant", "Short Code", "Products", "Status", "Action"]} rows={plants.map((plant) => [
    <span className="flex items-center gap-2 font-bold"><span className="h-3 w-3 rounded-full" style={{ background: plant.accent || "#64748b" }} />{plant.name}</span>,
    plant.short_code,
    plant.products.filter((item) => item.active).map((item) => item.product?.name).filter(Boolean).join(", ") || "No active Products",
    <Badge tone={plant.active ? "green" : "slate"}>{plant.active ? "Active" : "Inactive"}</Badge>,
    onEdit ? <Button variant="secondary" onClick={() => onEdit(plant)}><Pencil size={16} />Edit</Button> : "-",
  ])} />;
}

function ProductConfiguration({ link, index, update }) {
  return <fieldset className="mt-4 border-t border-slate-200 py-4">
    <legend className="font-bold">{link.product?.name || "Product"}</legend>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {[
        ["active", "Product Active"],
        ["uses_size_codes", "Uses Size Codes"],
        ["uses_class_types", "Uses Class Types"],
        ["uses_bags", "Track Bags"],
        ["uses_head_count", "Track Head Count"],
        ["allows_free_from_plant", "Allows Free from Plant"],
      ].map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={Boolean(link[key])} onChange={(e) => update(index, { [key]: e.target.checked })} />{label}</label>)}
      <Field label="Notes"><input className={inputClass()} value={link.notes || ""} onChange={(e) => update(index, { notes: e.target.value })} /></Field>
    </div>
    {link.uses_size_codes && <OptionEditor title="Size / Codes" rows={link.codes || []} valueKey="code" onChange={(codes) => update(index, { codes })} />}
    {link.uses_class_types && <OptionEditor title="Class Types" rows={link.classTypes || []} valueKey="class_type" onChange={(classTypes) => update(index, { classTypes })} />}
  </fieldset>;
}

function OptionEditor({ title, rows, valueKey, onChange }) {
  return <div className="mt-4 space-y-3">
    <p className="font-bold">{title}</p>
    {rows.map((row, index) => <div key={row.id || index} className="flex flex-wrap items-end gap-3">
      <Field label={valueKey === "code" ? "Operational Code" : "Class Type"}><input className={inputClass()} value={row[valueKey] || ""} onChange={(e) => onChange(rows.map((item, itemIndex) => itemIndex === index ? { ...item, [valueKey]: e.target.value } : item))} /></Field>
      <Field label="Display Label"><input className={inputClass()} value={row.display_name || ""} onChange={(e) => onChange(rows.map((item, itemIndex) => itemIndex === index ? { ...item, display_name: e.target.value } : item))} /></Field>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={row.active ?? true} onChange={(e) => onChange(rows.map((item, itemIndex) => itemIndex === index ? { ...item, active: e.target.checked } : item))} />Active</label>
    </div>)}
    <Button variant="secondary" onClick={() => onChange([...rows, { [valueKey]: "", display_name: "", active: true }])}><Plus size={16} />Add {valueKey === "code" ? "Code" : "Class Type"}</Button>
  </div>;
}
