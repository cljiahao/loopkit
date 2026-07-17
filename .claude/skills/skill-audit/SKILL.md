---
name: skill-audit
description: Surface repeated workflows worth capturing as committed project skills, from the skill-usage log.
disable-model-invocation: true
allowed-tools: "Bash(awk *), Bash(sort *), Bash(cat .claude/skill-usage.log), Bash(ls .claude/skills/*)"
---

# Skill Audit

Find workflows you repeat often that aren't yet committed project skills — so the repo (and teammates) carry them, not just your session memory.

## 1. Aggregate usage

```bash
[ -f .claude/skill-usage.log ] || { echo "No skill usage logged yet."; exit 0; }
awk -F'\t' '{c[$2]++} END{for (k in c) printf "%4d  %s\n", c[k], k}' .claude/skill-usage.log | sort -rn
```
