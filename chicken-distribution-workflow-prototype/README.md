# Chicken Distribution Workflow Prototype

This is a standalone concept workflow prototype for a whole-dressed chicken distributor. It is designed for client presentation and workflow validation only.

It is not the production system.

## What this prototype does not include

- No database
- No backend
- No authentication
- No persistence
- No Supabase
- No external APIs

All data is demo/mock data held in local React state. Data resets on page refresh.

## Tech Stack

- React
- Vite
- Tailwind CSS
- Lucide React icons
- Local React state only

## Launch

```bash
npm install
npm run dev
```

Then open the local URL shown in the terminal.

## Demo Flow

1. Dashboard: review KPIs, active trip inventory, today's collections, and attention items.
2. Trips / Stock In: confirm the prefilled Bounty Aug 30 stock-in demo.
3. Inventory: verify inventory is grouped by Plant -> Trip Date -> Product.
4. OUT / Orders: confirm the prefilled ABC Restaurant OUT across Bounty Aug 15 and Magnolia Aug 18.
5. Customers: inspect the ABC Restaurant Customer Ledger.
6. Collections: record the prefilled ₱30,000 cash collection and review oldest-first allocation.
7. Collections: record the prefilled Pedro Reyes fuel expense paid from Cash Collection.
8. Daily Cash Reports: generate Pedro Reyes Aug 30 DCR, enter a short actual remittance, and submit.
9. Discrepancies: review the cash shortage, price override, bank verification, and inventory difference.
10. Administration: review demo users, role badges, and audit log entries.

## Notes

This prototype keeps the client's current workflow language: Trip, Stock In, OUT, Collections, Daily Cash Report / DCR, Customer Ledger, and Discrepancies. Final features and workflows should be based on approved client requirements.
