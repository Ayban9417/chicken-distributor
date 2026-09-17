import { requireSupabase } from "../lib/supabaseClient.js";

const emptySnapshot = {
  stock: [],
  lots: [],
  movements: [],
  transferReceipts: [],
  transferReceiptLines: [],
  sales: [],
  saleLines: [],
  payments: [],
  allocations: [],
  balances: [],
  ledger: [],
  collectibles: [],
  expenses: [],
  dcrs: [],
  discrepancies: [],
  customers: [],
  prices: [],
  products: [],
  people: [],
  tripLines: [],
  trips: [],
  plants: [],
  codes: [],
  classes: [],
};

export async function loadSalesmanWorkspaceData(organizationId, client = requireSupabase()) {
  const { data, error } = await client.rpc("get_salesman_workspace", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return Object.fromEntries(
    Object.entries(emptySnapshot).map(([key, fallback]) => [key, Array.isArray(data?.[key]) ? data[key] : fallback]),
  );
}
