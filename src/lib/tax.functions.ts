import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { normaliseTax, type TaxSettings } from "@/lib/pricing";

/** Pricing and tax settings live in site_settings under the key "tax". Nothing secret is stored there. */

export const getTaxSettings = createServerFn({ method: "GET" }).handler(async (): Promise<TaxSettings> => {
  const { loadTaxSettings } = await import("@/server/tax.server");
  return loadTaxSettings();
});

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const text = (max: number) => z.string().trim().max(max);

const schema = z.object({
  gstEnabled: z.boolean(),
  ticketGstRate: z.number().min(0).max(40),
  pricesIncludeGst: z.boolean(),
  serviceChargeType: z.enum(["none", "percent", "flat"]),
  serviceChargeValue: z.number().min(0).max(100_000),
  serviceChargeGstRate: z.number().min(0).max(40),
  gstSplit: z.enum(["cgst_sgst", "igst"]),
  seller: z.object({
    legalName: text(150).min(1),
    gstin: text(15),
    address: text(400),
    state: text(60),
    stateCode: text(2),
    email: text(120),
    phone: text(30),
    sacCode: text(10),
    invoicePrefix: text(10).min(1),
    footerNote: text(300),
  }),
});

export const adminSaveTaxSettings = createServerFn({ method: "POST" })
  .validator((d: unknown) => schema.parse(d))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/server/auth.server");
    const { exec } = await import("@/server/db.server");
    const { audit } = await import("@/server/audit.server");
    const user = await requireUser(["admin"]);
    const value = normaliseTax(data);
    if (value.gstEnabled && !GSTIN.test(value.seller.gstin)) {
      throw new Error("Enter a valid 15-character GSTIN before turning GST on (example: 18ABCDE1234F1Z5).");
    }
    if (value.serviceChargeType === "percent" && value.serviceChargeValue > 100) throw new Error("Service charge cannot be more than 100%.");
    await exec`
      INSERT INTO site_settings (setting_key, setting_value) VALUES ('tax', ${JSON.stringify(value)})
      ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = UTC_TIMESTAMP(3)`;
    await audit(user, "update", "setting", "tax", { gstEnabled: value.gstEnabled, serviceChargeType: value.serviceChargeType });
    return { ok: true };
  });
