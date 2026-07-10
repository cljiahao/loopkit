// test/db/head-start-schema.test.ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

// Cheap guard against silent drift in the hand-written 0014 migration — regex
// presence checks only, not a substitute for running it against real Postgres.
const sql = readFileSync(
  "supabase/migrations/0014_loopkit_head_start.sql",
  "utf8",
);

describe("0014 head start", () => {
  it("adds a not-null, default-false head_start column to programs", () => {
    expect(sql).toMatch(
      /alter table loopkit\.programs\s+add column head_start boolean not null default false/i,
    );
  });

  it("recreates create_program with an additive, defaulted p_head_start", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.create_program\(/i,
    );
    expect(sql).toMatch(/p_head_start\s+boolean default false/i);
    expect(sql).toMatch(
      /insert into loopkit\.programs\s*\n\s*\(vendor_id, type, name, stamps_required, reward_text, config, expiry_days, head_start\)/i,
    );
  });

  it("recreates enroll_card seeding stamp/plant/streak progress when head_start is set", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.enroll_card\(p_program uuid, p_phone text\)/i,
    );
    expect(sql).toMatch(/if v_program\.head_start then/i);
    expect(sql).toMatch(/v_program\.type = 'stamp'/i);
    expect(sql).toMatch(/v_program\.type = 'plant'/i);
    expect(sql).toMatch(/v_program\.type = 'streak'/i);
    expect(sql).toMatch(
      /insert into loopkit\.cards \(program_id, phone, stamp_count, state\)/i,
    );
  });

  it("keeps enroll_card's phone validation and active-program guard", () => {
    expect(sql).toMatch(/p_phone !~ '\^\\\+65\[3689\]\[0-9\]\{7\}\$'/);
    expect(sql).toMatch(
      /select \* into v_program from loopkit\.programs where id = p_program and active/i,
    );
  });
});
