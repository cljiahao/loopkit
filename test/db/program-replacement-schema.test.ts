import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0016_loopkit_program_replacement.sql",
  "utf8",
);

describe("0016 program replacement", () => {
  it("adds a self-referencing replaced_by column", () => {
    expect(sql).toMatch(
      /alter table loopkit\.programs\s+add column replaced_by uuid references loopkit\.programs\(id\)/i,
    );
  });

  it("gates create_program's plan cap on active programs only", () => {
    expect(sql).toMatch(
      /select count\(\*\) from loopkit\.programs where vendor_id = v_uid and active/i,
    );
  });

  it("keeps create_program's phone-agnostic signature and grant unchanged", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.create_program\(/i,
    );
    expect(sql).toMatch(
      /grant execute on function loopkit\.create_program\(text, text, int, text, jsonb, int, boolean\) to authenticated/i,
    );
  });

  it("extends vendor_join's projection with replaced_by_name via a left join", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.vendor_join\(p_vendor uuid, p_phone text\)/i,
    );
    expect(sql).toMatch(/replaced_by_name text/i);
    expect(sql).toMatch(
      /left join loopkit\.programs r on r\.id = p\.replaced_by/i,
    );
    expect(sql).toMatch(
      /stamps_required, p\.expiry_days, c\.cycle_started_at, p\.active,\s*r\.name/i,
    );
  });

  it("keeps vendor_join's phone guard and active-only enrollment fan-out", () => {
    expect(sql).toMatch(/\^\\\+65\[3689\]\[0-9\]\{7\}\$/);
    expect(sql).toMatch(
      /where p\.vendor_id = p_vendor and p\.active\s*\n\s*and not exists/i,
    );
  });

  it("drops vendor_join before redefining it, since its RETURNS TABLE column list changed", () => {
    expect(sql).toMatch(
      /drop function if exists loopkit\.vendor_join\(uuid, text\);\s*\ncreate or replace function loopkit\.vendor_join\(p_vendor uuid, p_phone text\)/i,
    );
  });
});
