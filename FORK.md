# shelley-a11y

Fork of [boldsoftware/shelley](https://github.com/boldsoftware/shelley) by Christopher Sullivan.

**Purpose:** VoiceOver-first / screen-reader-friendly coding agent UI, plus practical BYO keys (including native DeepSeek) for a single-user blind operator.

**Upstream:** `upstream` remote → `boldsoftware/shelley`  
**Origin:** `origin` remote → `csullivan84/shelley-a11y`

## Fork deltas (high level)

- Native DeepSeek V4 Flash / Pro via `$DEEPSEEK_API_KEY` and `https://api.deepseek.com`
- VoiceOver status announcements (agent working / idle / stream faults)
- Journal of agent collaboration: `lazy.md`

## Run with DeepSeek

```bash
export DEEPSEEK_API_KEY=sk-...
make build
./bin/shelley serve -port 8002 -db /tmp/shelley-a11y.db
# pick model deepseek-v4-flash
```

## Merge discipline

Prefer small, reviewable commits. Rebase onto upstream `main` when convenient. Do not pretend this is a CLA-bound upstream contribution unless it is deliberately upstreamed.
