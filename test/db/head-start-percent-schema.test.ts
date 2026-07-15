// test/db/head-start-percent-schema.test.ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0024_loopkit_head_start_percent.sql",
  "utf8",
);

describe("0024 head start percent", () => {
  it("adds a not-null, default-20, range-checked head_start_percent column", () => {
    expect(sql).toMatch(
      /alter table loopkit\.programs\s+add column head_start_percent integer not null default 20\s+check \(head_start_percent between 5 and 50\)/i,
    );
  });

  it("recreates create_program with an additive, defaulted p_head_start_percent", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.create_program\(/i,
    );
    expect(sql).toMatch(/p_head_start_percent\s+int default 20/i);
    expect(sql).toMatch(
      /insert into loopkit\.programs\s*\n\s*\(vendor_id, type, name, stamps_required, reward_text, config, expiry_days,\s*\n\s*head_start, carry_over_stamps, active, head_start_percent\)/i,
    );
  });

  it("recreates enroll_card scaling the stamp/plant seed by head_start_percent", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.enroll_card\(p_program uuid, p_phone text\)/i,
    );
    expect(sql).toMatch(
      /v_seed := greatest\(1, round\(v_program\.stamps_required \* v_program\.head_start_percent \/ 100\.0\)::int\)/i,
    );
  });

  it("keeps the plant Sprout-stage floor fixed at 25%, not vendor-configurable", () => {
    expect(sql).toMatch(
      /'growth',\s*least\(\s*greatest\(v_seed, round\(v_program\.stamps_required \* 0\.25\)::int\),\s*v_program\.stamps_required - 1\s*\)/,
    );
  });

  it("keeps streak's seed fixed at one full period, never reading head_start_percent", () => {
    expect(sql).toMatch(
      /elsif v_program\.type = 'streak' then[\s\S]*?'current_streak', 1,/,
    );
    // The streak branch must not reference head_start_percent anywhere.
    const streakBranch = sql.slice(
      sql.indexOf("elsif v_program.type = 'streak' then"),
      sql.indexOf(
        "end if;",
        sql.indexOf("elsif v_program.type = 'streak' then"),
      ),
    );
    expect(streakBranch).not.toMatch(/head_start_percent/i);
  });
});
