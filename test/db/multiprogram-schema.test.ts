import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

// Cheap guard against silent drift in the hand-written 0007 migration — regex
// presence checks only, not a substitute for running it against real Postgres.
const sql = readFileSync(
  "supabase/migrations/0007_loopkit_multiprogram.sql",
  "utf8",
);

describe("0007 multi-program + vendor_pro", () => {
  it("drops the one-program-per-vendor unique constraint (idempotent)", () => {
    expect(sql).toMatch(
      /alter table loopkit\.programs\s+drop constraint if exists programs_vendor_id_key/i,
    );
  });

  it("indexes programs.vendor_id for the list query", () => {
    expect(sql).toMatch(
      /create index if not exists programs_vendor_idx on loopkit\.programs \(vendor_id\)/i,
    );
  });

  it("creates the vendor_pro allow-list table", () => {
    expect(sql).toMatch(/create table loopkit\.vendor_pro\b/i);
  });

  it("defines is_pro as a SECURITY DEFINER predicate mirroring is_admin", () => {
    expect(sql).toMatch(/create or replace function loopkit\.is_pro\(/i);
    expect(sql).toMatch(
      /language sql security definer stable set search_path/i,
    );
  });

  it("enables row level security on vendor_pro", () => {
    expect(sql).toMatch(
      /alter table loopkit\.vendor_pro enable row level security/i,
    );
  });

  it("grants select + execute to authenticated", () => {
    expect(sql).toMatch(
      /grant select on loopkit\.vendor_pro to authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function loopkit\.is_pro\(uuid\) to authenticated/i,
    );
  });

  it("documents the admin-only grant-Pro bootstrap", () => {
    expect(sql).toMatch(/insert into loopkit\.vendor_pro/i);
  });
});
