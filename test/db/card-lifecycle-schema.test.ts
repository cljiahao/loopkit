import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

// Cheap guard against silent drift in the hand-written 0012 migration — regex
// presence checks only, not a substitute for running it against real Postgres.
const sql = readFileSync(
  "supabase/migrations/0012_loopkit_card_lifecycle.sql",
  "utf8",
);

describe("0012 card lifecycle", () => {
  it("adds a bounded expiry_days column to programs", () => {
    expect(sql).toMatch(
      /alter table loopkit\.programs\s+add column expiry_days int/i,
    );
    expect(sql).toMatch(
      /check \(expiry_days is null or expiry_days between 1 and 3650\)/i,
    );
  });

  it("adds a not-null cycle_started_at column to cards, backfilled from created_at", () => {
    expect(sql).toMatch(/add column cycle_started_at timestamptz/i);
    expect(sql).toMatch(
      /update loopkit\.cards set cycle_started_at = created_at/i,
    );
    expect(sql).toMatch(/alter column cycle_started_at set not null/i);
  });

  it("widens stamp_events.kind to admit regen", () => {
    expect(sql).toMatch(
      /check \(kind in \('stamp','redeem','visit','win','regen'\)\)/i,
    );
  });

  it("recreates create_program with an additive, defaulted p_expiry_days", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.create_program\(/i,
    );
    expect(sql).toMatch(/p_expiry_days\s+int default null/i);
    expect(sql).toMatch(
      /grant execute on function loopkit\.create_program\([^)]*\) to authenticated/i,
    );
  });

  it("recreates card_view returning expiry_days and cycle_started_at", () => {
    expect(sql).toMatch(
      /drop function if exists loopkit\.card_view\(uuid, ?text\)/i,
    );
    expect(sql).toMatch(/expiry_days int, cycle_started_at timestamptz/i);
    expect(sql).toMatch(
      /grant execute on function loopkit\.card_view\([^)]*\) to anon/i,
    );
  });

  it("defines a phone-validated regenerate_card function granted to anon", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.regenerate_card\(p_program uuid, p_phone text\)/i,
    );
    expect(sql).toContain("p_phone !~ '^\\+65[3689][0-9]{7}$'");
    expect(sql).toMatch(
      /grant execute on function loopkit\.regenerate_card\([^)]*\) to anon/i,
    );
  });
});
