# VaxTui

VoiceOver-first fork of [boldsoftware/shelley](https://github.com/boldsoftware/shelley) by Christopher Sullivan.

**Product name:** VaxTui  
**Binary:** still `shelley` (upstream-compatible; rename later if needed)  
**Default branch:** `main` (this tree is the product; `fork/lazy-sunday` was the early work branch)

**Purpose:** Screen-reader-friendly coding agent UI for a single-user blind operator.

**Upstream:** `upstream` remote → `boldsoftware/shelley`  
**Origin:** `origin` remote → [`csullivan84/VaxTui`](https://github.com/csullivan84/VaxTui)

## Tracking policy (soft independence)

VaxTui is its own product. It does **not** track every Shelley release.

- Keep the `upstream` remote.
- Merge `upstream/main` on **our cadence** — when a batch has real value (scroll/Safari fixes, models, tools, security) or the merge debt is still manageable.
- Skip pure cosmetic thrash if it only rewrites a11y hot paths for no operator win.
- Prefer merge commits over long-lived rebases of the whole fork history.
- Do **not** hard-split (drop upstream) until a11y is stable *and* merge cost exceeds the value of a few weeks of upstream work.

When resolving conflicts: keep VaxTui a11y contracts (announcer, tool bodies, VO focus hygiene, screen-reader mode) and adopt upstream behavior around them.

## Fork deltas (high level)

- Onboarding accepts an OpenRouter API key, stored in Shelley's own `~/.config/shelley/providers.json` (mode 0600)
- VoiceOver status announcements (agent working / idle / stream faults)
- Tool and transcript a11y (collapsed output stays reachable, live-region hygiene)
- Screen reader mode in the overflow menu (expand tools; markdown still via command palette)
- Herds — durable terminal packs with open/close-all and focus-only PTY attach
- Journal of agent collaboration: `lazy.md` (historical; not product branding)

## Upstream contributions

Do not pretend this is a CLA-bound upstream contribution unless it is deliberately upstreamed. Upstream PRs should be focused a11y slices without personal journal noise.
