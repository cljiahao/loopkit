import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Cheap guard against silent drift in the hand-written 0003 migration — regex
// presence checks only, not a substitute for running it against real Postgres.
const sql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0003_loopkit_admin.sql"),
  "utf8",
);

describe("0003_loopkit_admin.sql", () => {
  it.each(["admins", "admin_audit"])("creates table loopkit.%s", (table) => {
    expect(sql).toMatch(new RegExp(`create table loopkit\\.${table}\\b`));
  });

  it("defines the is_admin membership function", () => {
    expect(sql).toMatch(/create or replace function loopkit\.is_admin\(/);
  });

  it.each(["admins", "admin_audit"])(
    "enables row level security on loopkit.%s",
    (table) => {
      expect(sql).toMatch(
        new RegExp(
          `alter table loopkit\\.${table}\\s+enable row level security`,
        ),
      );
    },
  );

  it("grants the service role full access to both tables", () => {
    expect(sql).toMatch(
      /grant all on loopkit\.admins, loopkit\.admin_audit to service_role/,
    );
  });
});
