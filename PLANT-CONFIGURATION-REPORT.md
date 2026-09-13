# Dynamic Plant Configuration

## Model and Admin UI

Local React state holds Plant entities: id, name, originalName, shortCode, active,
accent and products. A small shared Product Master provides stable product IDs;
each plant owns its product name, category, active flag, usesSizeCodes,
sizeCodes, allowsFreeFromPlant, defaultUnit and notes. Custom products are supported.
Code IDs are stable and separate from editable display names. The operational
unit remains kg, with independently entered bags.

Administration > Manage Plants is only exposed for the Owner / Admin demo role.
Changing to Agent, Cashier or Warehouse closes the configuration view and hides
its entry point. This is UI gating only, not authentication or security.

Admin can add/edit plants and products, choose an accent, toggle active status,
add/edit/deactivate codes and remove unused products/codes. Used configuration
has disabled remove controls with explanatory tooltips. Plants are deactivated,
never hard-deleted. Names and short codes must be unique; historical plant names
cannot be claimed by another plant. Coded active products need an active code.

## Integration and History

- Stock In shows active plants and their active products only. Coded products
  require an active configured code selected from a menu; no arbitrary staff input.
- Uncoded products show no code field. Switching plant/product resets incompatible
  product, code, acquisition and price entries. Free-stock choices respect configuration.
- Receipts snapshot plant/product labels, product category, code display name,
  product/code IDs, bags, KG and acquisition cost. Free receipts have zero cost.
- Sales use the selected Trip's actual product/code rows. Uncoded rows have no
  code selector. Exact Trip + Product + Code stock deduction remains unchanged.
- Deactivation stops future Stock In but does not prevent selling existing stock.
  Historical labels and costs remain visible in Inventory, Sales and Reports.
- Inventory groups actual receipt rows, sorts arbitrary code names naturally and
  retains sold-out lines. Whole Chicken/by-product totals use receipt categories,
  with a legacy fallback for old receipts. No configuration edit rewrites COGS,
  margins, selling prices, ledger entries, payments or DCR records.

## Demo Configurations

- Bounty: Whole Dressed Chicken with P1/P2/G; Liver, Gizzard, Feet and Head uncoded.
- Magnolia: Whole Dressed Chicken, Liver, Gizzard and Feet, all uncoded for new intake.
- San Miguel / Magnolia: uncoded Whole Dressed Chicken and Liver.
- Other Plant: uncoded Whole Dressed Chicken only.

All existing Trips remain intact. In particular, Magnolia's older P1/P2/G and
Head stock remain available as historical inventory, despite the different new
intake configuration. No historical quantities, costs or transaction totals changed.

## Verification

22 automated tests pass, including seven new plant tests covering dynamic codes,
active-only intake, required codes, per-plant products, free allowances, exact
coded/uncoded deductions, independent COGS, receipt snapshots and reference protection.

Browser checks completed:

- Created QA Uncoded with Whole Chicken only; received 100 kg at fictional PHP 140/kg.
- Created QA Coded with P1/P2/G plus Liver; missing-code intake was rejected.
- Received 100 kg of G at fictional PHP 142/kg. Liver appeared only on the configured plant.
- Sold 10 kg of G and 20 kg uncoded; respective stock balances became 90 kg and 80 kg.
- Deactivated used G: removal was disabled, G vanished from intake, old G stock remained.
- Deactivated the used product: intake offered only Liver; historical receipt retained.
- Deactivated QA Coded: absent from intake, still present in historical Plant Trips.
- Agent role exposed neither Manage Plants nor Add Plant.
- Checked Plants, Inventory, Sales, Reports and Manage Plants at 1440, 820 and 390px:
  15 checks with no page overflow. Inspected configuration and operational screenshots.
- Browser error/warning console was empty.

Baseline current-week results remain PHP 228,135 sales, PHP 172,850 COGS,
PHP 3,900 expenses and PHP 51,385 profit estimate. Production build passes.

## Files

- src/utils/plants.js: configuration seeds, Product Master, reference checks and snapshots.
- src/components/PlantManagement.jsx: Admin plant/product/code editor.
- src/App.jsx: local configuration/role state, Stock In, Sales and Inventory integration.
- src/components/ui.jsx: plant accent context.
- src/data/demoData.js: configuration exports replacing unused string lists.
- src/utils/business.js, src/utils/operations.js, src/components/Reporting.jsx:
  receipt-category-aware totals while preserving legacy calculations.
- src/index.css: scoped mobile plant-list label sizing.
- tests/plants.test.js: new regression checks.
- README.md and this report: walkthrough and verification.

Everything remains frontend-only and resets on reload. No packages, backend,
database, persistence or authentication infrastructure were added. No GitHub push.
