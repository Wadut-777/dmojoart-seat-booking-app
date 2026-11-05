import { hasExtras, rupees, type PriceBreakup } from "@/lib/pricing";

/** Itemised price lines (ticket value, GST, service charge, round-off). Renders nothing when there is nothing extra to show. */
export function PriceLines({ breakup, className = "" }: { breakup: PriceBreakup | null | undefined; className?: string }) {
  if (!breakup || !hasExtras(breakup)) return null;
  const rows: [string, number][] = [["Tickets", breakup.taxableTicket]];
  if (breakup.ticketGst > 0) rows.push([`GST @ ${breakup.ticketGstRate}% on tickets`, breakup.ticketGst]);
  if (breakup.serviceCharge > 0) rows.push(["Service charge", breakup.serviceCharge]);
  if (breakup.serviceChargeGst > 0) rows.push([`GST @ ${breakup.serviceChargeGstRate}% on service charge`, breakup.serviceChargeGst]);
  if (Math.abs(breakup.roundOff) > 0.004) rows.push(["Round off", breakup.roundOff]);
  return (
    <dl className={`space-y-1 text-left text-xs ${className}`}>
      {rows.map(([label, amount]) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="opacity-80">{label}</dt>
          <dd className="font-medium tabular-nums">
            {amount < 0 ? "-" : ""}₹{rupees(Math.abs(amount))}
          </dd>
        </div>
      ))}
    </dl>
  );
}
