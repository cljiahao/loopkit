import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Presence checks against the hand-written 0002 migration — a cheap guard
// against silent drift, not a substitute for running it on a real Postgres.
const sql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0002_loopkit_stamp_cap.sql"),
  "utf8",
);

describe("0002_loopkit_stamp_cap.sql", () => {
  it("redefines add_stamp and card_status", () => {
    expect(sql).toMatch(/create or replace function loopkit\.add_stamp\(/);
    expect(sql).toMatch(/create or replace function loopkit\.card_status\(/);
  });

  it("caps add_stamp at the program's requirement", () => {
    expect(sql).toMatch(/stamp_count\s*<\s*v_required/);
  });

  it("drops card_status before recreating it with the new return type", () => {
    expect(sql).toMatch(
      /drop function if exists loopkit\.card_status\(uuid, text\)/,
    );
  });

  it("card_status returns the program name", () => {
    expect(sql).toMatch(/returns table \(name text/);
  });

  it("re-grants execute on card_status to the data-API roles", () => {
    expect(sql).toMatch(
      /grant execute on function loopkit\.card_status\(uuid, text\) to anon, authenticated, service_role/,
    );
  });
});
