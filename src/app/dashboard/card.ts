// Shared client/server card shape for the dashboard's stamp/lookup/redeem flows.
// A "use server" module may only export async functions, so this plain module
// is what both actions.ts and the form components import.
export type StampCard = { id: string; phone: string; stamp_count: number };
