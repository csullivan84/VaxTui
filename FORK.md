# VaxTui

VoiceOver-first fork of [boldsoftware/shelley](https://github.com/boldsoftware/shelley) by Christopher Sullivan.

**Product name:** VaxTui  
**Binary:** still `shelley` (upstream-compatible; rename later if needed)

**Purpose:** Screen-reader-friendly coding agent UI, plus practical BYO keys (including native DeepSeek) for a single-user blind operator.

**Upstream:** `upstream` remote → `boldsoftware/shelley`  
**Origin:** `origin` remote → [`csullivan84/VaxTui`](https://github.com/csullivan84/VaxTui)

## Fork deltas (high level)

- Native DeepSeek V4 Flash / Pro via `$DEEPSEEK_API_KEY` and `https://api.deepseek.com`
- VoiceOver status announcements (agent working / idle / stream faults)
- Tool and transcript a11y (collapsed output stays reachable, live-region hygiene)
- Journal of agent collaboration: `lazy.md`

## Run with DeepSeek

```bash
export DEEPSEEK_API_KEY=sk-...
make build
./bin/shelley serve -port 8002 -db /tmp/vaxtui.db
# pick model deepseek-v4-flash
```

## Merge discipline

Prefer small, reviewable commits. Rebase onto upstream `main` when convenient. Do not pretend this is a CLA-bound upstream contribution unless it is deliberately upstreamed. Upstream PRs should be focused a11y slices without fork-only DeepSeek or personal journal noise.
