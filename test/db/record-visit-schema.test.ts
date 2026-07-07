import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0005_loopkit_record_visit.sql",
  "utf8",
);

describe("0005 record_visit", () => {
  it("defines the SECURITY DEFINER record_visit function", () => {
    expect(sql).toMatch(/create or replace function loopkit\.record_visit\(/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = ''/i);
  });
  it("gates on owns_program", () => {
    expect(sql).toMatch(/owns_program\(p_program\)/i);
  });
  it("upserts the card state and logs an event", () => {
    expect(sql).toMatch(/on conflict \(program_id, phone\) do update/i);
    expect(sql).toMatch(/insert into loopkit\.stamp_events/i);
  });
  it("grants execute to authenticated", () => {
    expect(sql).toMatch(
      /grant execute on function loopkit\.record_visit\(uuid, ?text, ?jsonb, ?text, ?jsonb\) to authenticated/i,
    );
  });
});
