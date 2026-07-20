import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  listPrograms,
  isPro,
  canCreateProgram,
  getEntitlement,
  applyDueCutovers,
} from "@/lib/program";
import { requireVendor } from "@/features/auth";
import { qrSvg } from "@/lib/qr";
import { ProgramCard } from "@/app/dashboard/program-card";
import { NewProgramTile } from "@/app/dashboard/new-program-tile";
import { ShopQrBlock } from "@/app/dashboard/shop-qr-block";
import { ScanAndRoute } from "@/app/dashboard/scan-and-route";
import { shouldShowQr } from "@/app/dashboard/dashboard-view";

export default async function DashboardPage() {
  const { user } = await requireVendor();
  await applyDueCutovers();

  const programs = await listPrograms();
  // True first run — no programs of any kind yet. A vendor who has
  // programs but paused all of them is NOT redirected (see the empty-state
  // branch below): redirecting them away from their own dashboard would be
  // a surprising dead end, not a "go set up" nudge.
  if (programs.length === 0) redirect("/setup");

  const activePrograms = programs.filter((prog) => prog.active);

  const pro = await isPro();

  // The QR must encode an absolute URL — a host-less path is unscannable. Fall
  // back to the request host when NEXT_PUBLIC_BASE_URL is unset.
  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_BASE_URL ??
    `https://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const cardLink = `${origin}/c?v=${user.id}`;
  const cardQr = await qrSvg(cardLink);

  const canCreate = canCreateProgram(
    getEntitlement(pro),
    activePrograms.length,
  );

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-5 py-10">
      {!shouldShowQr(activePrograms.length) ? (
        <div className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          None of your programs are active right now.{" "}
          <a href="/setup" className="font-medium text-primary hover:underline">
            Manage them in Setup
          </a>{" "}
          to reactivate one.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
            <div className="sm:flex-[1.4]">
              <ShopQrBlock
                qrSvgMarkup={cardQr}
                link={cardLink}
                programNames={activePrograms.map((prog) => prog.name)}
              />
            </div>
            <div className="sm:flex-1">
              <ScanAndRoute />
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Your programs
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activePrograms.map((prog) => (
                <ProgramCard key={prog.id} program={prog} />
              ))}
              <NewProgramTile canCreate={canCreate} />
            </div>
          </div>
        </>
      )}
    </main>
  );
}
