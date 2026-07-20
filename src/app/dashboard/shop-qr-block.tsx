import { CardLinkActions } from "@/app/dashboard/card-link";
import { ElevatedCard } from "@/components/elevated-card";

// Shared shop-wide QR — one per vendor, not per program (a per-program QR
// would need a new scoped join RPC; out of scope, see the design spec).
// Always visible (not collapsed) with an explicit instruction next to the
// code — a bare QR with no CTA is a common failure mode.
export function ShopQrBlock({
  qrSvgMarkup,
  link,
  programNames,
}: {
  qrSvgMarkup: string;
  link: string;
  programNames: string[];
}) {
  const joinCopy =
    programNames.length > 0
      ? `Customers scan this to join ${programNames.join(", ")}.`
      : "Customers scan this to join your programs.";

  return (
    <ElevatedCard className="flex h-full flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
      <div
        className="shrink-0 rounded-xl border bg-white p-2 [&_svg]:size-20"
        dangerouslySetInnerHTML={{ __html: qrSvgMarkup }}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium">{joinCopy}</p>
        <code className="block truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
          {link}
        </code>
        <CardLinkActions link={link} />
      </div>
    </ElevatedCard>
  );
}
