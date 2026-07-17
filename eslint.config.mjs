import next from "eslint-config-next";
import sonarjs from "eslint-plugin-sonarjs";

const eslintConfig = [
  ...next,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "supabase/**",
      "coverage/**",
      ".stryker-tmp/**",
      "reports/**",
      "test-results/**",
      "playwright-report/**",
      "scripts/demo/out/**",
      ".claude/worktrees/**",
    ],
  },
  {
    // Comment hygiene (templateCentral standard, full parity): own-line
    // comments are a hard gate, not a nudge — a comment states the *why*
    // above the code rather than trailing it, and commented-out code never
    // survives a commit (version control has the history).
    plugins: { sonarjs },
    rules: {
      "no-inline-comments": "error",
      "sonarjs/no-commented-code": "error",
    },
  },
  {
    // Tests and one-off scripts routinely label table-driven cases and
    // fixtures with short trailing notes; that reads better inline, so the
    // gate would be pure noise there.
    files: ["**/*.test.{ts,tsx}", "**/test/**", "scripts/**", "e2e/**"],
    rules: {
      "no-inline-comments": "off",
      "sonarjs/no-commented-code": "off",
    },
  },
];

export default eslintConfig;
