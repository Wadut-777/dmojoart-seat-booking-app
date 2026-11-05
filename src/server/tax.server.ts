import { sql } from "@/server/db.server";
import { DEFAULT_TAX, normaliseTax, type TaxSettings } from "@/lib/pricing";

/** Current pricing/tax settings. Falls back to "no GST, no service charge" (the original behaviour) when unset or unreadable. */
export async function loadTaxSettings(): Promise<TaxSettings> {
  try {
    const [row] = await sql<{ setting_value: string }[]>`SELECT setting_value FROM site_settings WHERE setting_key = 'tax'`;
    return row ? normaliseTax(JSON.parse(row.setting_value)) : DEFAULT_TAX;
  } catch {
    return DEFAULT_TAX;
  }
}
