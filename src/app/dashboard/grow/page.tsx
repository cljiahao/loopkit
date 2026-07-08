import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireVendor } from "@/lib/auth";
import { listPrograms, currentProgram } from "@/lib/program";
import { qrSvg } from "@/lib/qr";
import { CardLinkActions } from "@/app/dashboard/card-link";

export default async function GrowPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await requireVendor();

  const programs = await listPrograms();
  const { p } = await searchParams;
  const program = currentProgram(programs, p);
  if (!program) redirect("/setup");

  // The QR must encode an absolute URL — a host-less path is unscannable. Fall
  // back to the request host when NEXT_PUBLIC_BASE_URL is unset.
  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_BASE_URL ??
    `https://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const cardLink = `${origin}/c?p=${program.id}`;
  const cardQr = await qrSvg(cardLink);

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Get customers to join
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Print this QR at your counter or till — new customers scan it to join{" "}
          <strong>{program.name}</strong> themselves, no typing needed from you.
          Returning customers use the same link to check their card.
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div
            className="shrink-0 rounded-xl border bg-white p-2 [&_svg]:size-32"
            dangerouslySetInnerHTML={{ __html: cardQr }}
          />
          <div className="min-w-0 space-y-3">
            <code className="block truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
              {cardLink}
            </code>
            <CardLinkActions link={cardLink} />
          </div>
        </div>
      </div>
    </main>
  );
}
