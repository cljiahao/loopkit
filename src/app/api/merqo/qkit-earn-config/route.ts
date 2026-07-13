import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const revalidate = 0;

// Ported verbatim from qkit's `bearerOk` — keep in lockstep with every other
// /api/merqo/* route in both repos.
function bearerOk(request: Request): boolean {
  const secret = process.env.MERQO_METRICS_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

export async function GET(request: Request) {
  if (!bearerOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const vendorId = searchParams.get("vendor_id");
  if (!vendorId) {
    return NextResponse.json({ error: "vendor_id required" }, { status: 400 });
  }

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("qkit_earn_config")
    .select("enabled, programs(name)")
    .eq("vendor_id", vendorId)
    .maybeSingle();

  if (error) {
    console.error("qkit-earn-config: read failed", error.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  if (!data || !data.enabled) {
    return NextResponse.json({ enabled: false });
  }

  const programName = (data.programs as unknown as { name: string } | null)
    ?.name;
  return NextResponse.json({ enabled: true, program_name: programName });
}
