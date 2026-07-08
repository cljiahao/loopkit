import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0009_loopkit_enroll_phone_guard.sql",
  "utf8",
);

describe("0009 enroll phone guard", () => {
  it("rejects malformed phones inside enroll_card", () => {
    expect(sql).toMatch(/create or replace function loopkit\.enroll_card\(/i);
    expect(sql).toMatch(/\^\\\+65\[3689\]\[0-9\]\{7\}\$/);
  });
  it("keeps the active-program guard", () => {
    expect(sql).toMatch(/id = p_program and active/i);
  });
});
