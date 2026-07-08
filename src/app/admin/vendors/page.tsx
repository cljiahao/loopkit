import { requireAdmin } from "@/lib/admin";
import { listVendors } from "@/lib/admin-data";
import { Badge } from "@/components/ui/badge";
import { VendorProToggle } from "@/app/admin/vendors/vendor-pro-toggle";

export const revalidate = 0;

export default async function AdminVendorsPage() {
  await requireAdmin();

  const vendors = await listVendors();

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-5 py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Internal
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Vendors</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant Pro to lift a vendor&apos;s one-program limit.
        </p>
      </div>

      {vendors.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          No vendors yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3 text-right">Programs</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3 text-right">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {vendors.map((v) => (
                <tr key={v.vendor_id} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{v.email ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {v.program_count}
                  </td>
                  <td className="px-4 py-3">
                    {v.is_pro ? (
                      <Badge variant="gold">Pro</Badge>
                    ) : (
                      <Badge variant="outline">Free</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <VendorProToggle
                      vendorId={v.vendor_id}
                      email={v.email}
                      isPro={v.is_pro}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
