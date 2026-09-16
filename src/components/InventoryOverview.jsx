import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Banknote, ChevronRight, PackageCheck, Search, Truck, Users } from "lucide-react";
import { Badge, Button, Field, inputClass, PlantName, SectionHeader, StatCard, StatMini } from "./ui";
import { currency, kg, productLabel, shortDate } from "../utils/business";
import { filterInventoryRows, groupInventoryByTrip, inventoryPlantSummaries, summarizeInventoryRows } from "../utils/inventoryOverview";

const isWholeChicken = (row) => row.category === "Whole Chicken" || row.product === "Whole Dressed Chicken";
const nearZero = (value) => Math.abs(Number(value || 0)) < 0.01;

function PlantCard({ summary, onSelect }) {
  return <button type="button" className="rounded-lg border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md" onClick={() => onSelect(summary.plant)} aria-label={`View ${summary.plant} inventory`}>
    <div className="flex items-start justify-between gap-3">
      <div><h2><PlantName name={summary.plant} /></h2><p className="mt-2 text-sm font-semibold text-slate-500">{summary.trips} trip{summary.trips === 1 ? "" : "s"} / {summary.soldOut} sold out</p></div>
      <span className="rounded-lg bg-blue-50 p-2 text-blue-600"><PackageCheck size={22} /></span>
    </div>
    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-slate-100 py-4 text-sm sm:grid-cols-3">
      <div><dt className="text-slate-500">Original</dt><dd className="font-bold">{kg(summary.originalQty)}</dd></div>
      <div><dt className="text-slate-500">Warehouse</dt><dd className="font-bold">{kg(summary.warehouseQty)}</dd></div>
      <div><dt className="text-slate-500">With Salesmen</dt><dd className="font-bold">{kg(summary.salesmanQty)}</dd></div>
      <div><dt className="text-slate-500">Sold</dt><dd className="font-bold">{kg(summary.soldQty)}</dd></div>
      <div><dt className="text-slate-500">Remaining</dt><dd className="font-bold text-emerald-700">{kg(summary.remainingQty)}</dd></div>
      <div><dt className="text-slate-500">Inventory Value</dt><dd className="font-bold">{currency(summary.inventoryCostValue)}</dd></div>
    </dl>
    <p className="mt-3 text-sm font-semibold text-slate-600">Whole Chicken: {kg(summary.wholeChickenQty)} / By-products: {kg(summary.byProductQty)}</p>
    <span className="mt-4 flex items-center justify-between text-sm font-bold text-blue-700">View Inventory <ChevronRight size={18} /></span>
  </button>;
}

function InventoryLine({ row, onSelect }) {
  const soldOut = Number(row.remainingQty || 0) === 0;
  return <button type="button" className="inventory-product" onClick={() => onSelect?.(row)} aria-label={`View movements for ${productLabel(row.product, row.sizeCode, row.classType, row.sizeCodeLabel, row.classTypeLabel)}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-extrabold uppercase">{row.product}</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {row.sizeCode && <Badge tone="blue">Code / Size: {row.sizeCode}{row.sizeCodeLabel && row.sizeCodeLabel !== row.sizeCode ? ` / ${row.sizeCodeLabel}` : ""}</Badge>}
          {row.classType && <Badge tone="purple">Class: {row.classType}{row.classTypeLabel && row.classTypeLabel !== row.classType ? ` / ${row.classTypeLabel}` : ""}</Badge>}
          {row.acquisitionType === "Free from Plant" && <Badge tone="green">Free from Plant</Badge>}
        </div>
      </div>
      <div className={`remaining-stock ${soldOut ? "sold-out" : ""}`}><p>Remaining</p><strong>{kg(row.remainingQty)}</strong><Badge tone={soldOut ? "red" : Number(row.remainingQty) < 100 ? "amber" : "green"}>{soldOut ? "SOLD OUT" : Number(row.remainingQty) < 100 ? "Low Stock" : "Available"}</Badge></div>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4 sm:grid-cols-3 xl:grid-cols-6">
      {[
        ["Original KG", kg(row.originalQty)],
        ["Warehouse KG", kg(row.warehouseQty)],
        ["Salesman KG", kg(row.salesmanQty)],
        ["Sold KG", kg(row.soldQty)],
        ["Cost / KG", currency(row.costPerKg)],
        ["Inventory Value", currency(row.inventoryCostValue)],
      ].map(([label, value]) => <div key={label}><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-950">{value}</p></div>)}
      {row.bags !== null && row.bags !== undefined && <div><p className="text-xs font-semibold uppercase text-slate-500">Bags</p><p className="mt-1 font-bold">{row.bags}</p></div>}
      {row.headCount !== null && row.headCount !== undefined && <div><p className="text-xs font-semibold uppercase text-slate-500">Head Count</p><p className="mt-1 font-bold">{row.headCount}</p></div>}
    </div>
    <div className={`mt-4 flex flex-wrap items-center justify-between gap-2 border-l-4 px-3 py-2 text-sm ${nearZero(row.reconciliationDelta) ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-amber-500 bg-amber-50 text-amber-900"}`}>
      <span><strong>Reconciliation:</strong> {kg(row.warehouseQty)} warehouse + {kg(row.salesmanQty)} with Salesmen + {kg(row.soldQty)} sold = {kg(Number(row.warehouseQty || 0) + Number(row.salesmanQty || 0) + Number(row.soldQty || 0))}</span>
      <Badge tone={nearZero(row.reconciliationDelta) ? "green" : "amber"}>{nearZero(row.reconciliationDelta) ? "Reconciled" : `Variance ${kg(row.reconciliationDelta)}`}</Badge>
    </div>
    <p className="mt-3 flex items-center gap-1 text-sm font-semibold text-blue-700">View Movements <ChevronRight size={16} /></p>
  </button>;
}

function StockGroup({ title, rows, onSelect, whole = false }) {
  if (!rows.length) return null;
  const totals = summarizeInventoryRows(rows);
  return <div className="mt-5">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-2">
      <div><p className="text-sm font-extrabold uppercase text-slate-800">{title}</p>{whole && <p className="mt-1 text-sm font-semibold text-slate-500">Total Original KG - Whole Chicken: {kg(totals.originalQty)}</p>}</div>
      <p className="text-sm font-semibold text-slate-600">Warehouse {kg(totals.warehouseQty)} / Salesmen {kg(totals.salesmanQty)} / Sold {kg(totals.soldQty)} / Remaining {kg(totals.remainingQty)}</p>
    </div>
    {rows.map((row) => <InventoryLine key={row.id} row={row} onSelect={onSelect} />)}
  </div>;
}

export function InventoryOverview({ rows = [], onSelect, onStockIn, initialPlant = "" }) {
  const [selectedPlant, setSelectedPlant] = useState(initialPlant);
  const [plantQuery, setPlantQuery] = useState("");
  const [tripFilter, setTripFilter] = useState("All");
  const [productQuery, setProductQuery] = useState("");
  const [productMode, setProductMode] = useState("All Products");
  const plantSummaries = useMemo(() => inventoryPlantSummaries(rows, plantQuery), [rows, plantQuery]);
  const selectedRows = useMemo(() => rows.filter((row) => row.plant === selectedPlant), [rows, selectedPlant]);
  const selectedSummary = useMemo(() => summarizeInventoryRows(selectedRows), [selectedRows]);
  const tripOptions = useMemo(() => groupInventoryByTrip(selectedRows), [selectedRows]);
  const filteredRows = useMemo(() => filterInventoryRows(rows, { plant: selectedPlant, tripId: tripFilter, productQuery, productMode }), [rows, selectedPlant, tripFilter, productQuery, productMode]);
  const tripGroups = useMemo(() => groupInventoryByTrip(filteredRows), [filteredRows]);

  useEffect(() => {
    if (selectedPlant && !rows.some((row) => row.plant === selectedPlant)) setSelectedPlant("");
  }, [rows, selectedPlant]);

  const choosePlant = (plant) => { setSelectedPlant(plant); setTripFilter("All"); setProductQuery(""); setProductMode("All Products"); };
  const backToPlants = () => { setSelectedPlant(""); setTripFilter("All"); setProductQuery(""); setProductMode("All Products"); };

  if (!selectedPlant) return <>
    <SectionHeader title="Inventory" eyebrow="Company Inventory by Plant" />
    <div className="mb-5 max-w-xl"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} /><input className={`${inputClass()} pl-10`} aria-label="Search Plant" placeholder="Search Plant" value={plantQuery} onChange={(event) => setPlantQuery(event.target.value)} /></div></div>
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3" data-testid="inventory-plant-list">
      {plantSummaries.map((summary) => <PlantCard key={summary.plant} summary={summary} onSelect={choosePlant} />)}
      {!plantSummaries.length && <div className="border-y border-slate-200 bg-white px-4 py-6 text-sm font-semibold text-slate-500">{rows.length ? "No Plants match the search." : <><p>No inventory history yet.</p>{onStockIn && <Button className="mt-3" onClick={onStockIn}>Stock In Product</Button>}</>}</div>}
    </div>
  </>;

  return <>
    <SectionHeader title={<PlantName name={selectedPlant} />} eyebrow="Inventory / Plant / Trip / Product" action={<Button variant="secondary" onClick={backToPlants}><ArrowLeft size={18} />Back to Plants</Button>} />
    <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500" aria-label="Inventory breadcrumb"><button type="button" className="text-blue-700" onClick={backToPlants}>Inventory</button><ChevronRight size={16} /><span className="text-slate-950">{selectedPlant}</span>{tripFilter !== "All" && <><ChevronRight size={16} /><span className="text-slate-950">{shortDate(tripOptions.find((trip) => trip.tripId === tripFilter)?.tripDate)}</span></>}</nav>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard label="Total Original KG" value={kg(selectedSummary.originalQty)} icon={Truck} />
      <StatCard label="Warehouse KG" value={kg(selectedSummary.warehouseQty)} icon={PackageCheck} tone="green" />
      <StatCard label="With Salesmen KG" value={kg(selectedSummary.salesmanQty)} icon={Users} />
      <StatCard label="Sold KG" value={kg(selectedSummary.soldQty)} icon={PackageCheck} tone="amber" />
      <StatCard label="Total Remaining KG" value={kg(selectedSummary.remainingQty)} detail={currency(selectedSummary.inventoryCostValue) + " inventory value"} icon={Banknote} tone="green" />
    </div>
    <div className="mt-5 grid gap-3 md:grid-cols-[220px_1fr_190px]">
      <Field label="Trip / Date"><select className={inputClass()} value={tripFilter} onChange={(event) => setTripFilter(event.target.value)}><option value="All">View All Trips</option>{tripOptions.map((trip) => <option key={trip.tripId} value={trip.tripId}>{shortDate(trip.tripDate)} / {trip.tripCode}</option>)}</select></Field>
      <Field label="Product Search"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} /><input className={`${inputClass()} pl-10`} placeholder="Search product, code, class, or trip" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} /></div></Field>
      <Field label="Product Type"><select className={inputClass()} value={productMode} onChange={(event) => setProductMode(event.target.value)}><option>All Products</option><option>Whole Chicken</option><option>By-products</option></select></Field>
    </div>
    <div className="mt-6 space-y-7" data-testid="inventory-trip-list">
      {tripGroups.map((group) => {
        const whole = group.rows.filter(isWholeChicken);
        const byProducts = group.rows.filter((row) => !isWholeChicken(row));
        const totals = summarizeInventoryRows(group.rows);
        return <section key={group.tripId} className="border-t-2 border-slate-300 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold uppercase text-blue-700">Trip / Date</p><h2 className="mt-1 text-xl font-extrabold uppercase">{shortDate(group.tripDate)}</h2><p className="text-sm font-semibold text-slate-500">{group.tripCode}</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><StatMini label="Original" value={kg(totals.originalQty)} /><StatMini label="Remaining" value={kg(totals.remainingQty)} /><StatMini label="Sold" value={kg(totals.soldQty)} /></div></div>
          <StockGroup title="Whole Dressed Chicken" rows={whole} onSelect={onSelect} whole />
          <StockGroup title="By-products" rows={byProducts} onSelect={onSelect} />
        </section>;
      })}
      {!tripGroups.length && <p className="border-y border-slate-200 py-6 text-sm font-semibold text-slate-500">No products match the selected trip or filters.</p>}
    </div>
  </>;
}
