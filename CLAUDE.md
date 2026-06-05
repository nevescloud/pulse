# pulse

GitHub Pages dashboard for trending GitHub repos and HuggingFace models. Tools register with the browser's AI context via WebMCP (`navigator.modelContext`) so an external agent can drive the view, instead of an embedded chat.

## Architecture

Flat files, no build step. Keep concerns in separate files.

| File | Owns |
|------|------|
| `scripts/fetch.js` | Node.js scraper — GitHub HTML + HuggingFace API. Also appends to `data/history.json`. No npm deps. |
| `scripts/build-history.js` | One-time bootstrap. Walks `git log` on `data/*.json` to seed `data/history.json`. Safe to re-run. |
| `.github/workflows/fetch-trending.yml` | Scheduled Action: runs scraper, commits data/*.json |
| `data/github.json` | Committed by Action. Never edit by hand. |
| `data/huggingface.json` | Committed by Action. Never edit by hand. |
| `data/spaces.json` | Committed by Action. Never edit by hand. |
| `data/history.json` | 90-day per-item observation log keyed by source → id → `[{d,v,r}]`. Day-resolution; latest of each day wins. |
| `index.html` | Shell + layout. ECharts loaded via jsDelivr CDN. |
| `index.css` | All styles. CSS custom properties for theming. |
| `tools.js` | `TOOL_DEFS` array — WebMCP tool surface (each entry: trust hints, JSON schema, `execute` handler) |
| `charts.js` | `renderVelocityChart()` (ECharts horizontal bar) + `buildSparkline()` (plain SVG, no ECharts per card) |
| `github.js` | `renderGitHubCards(data, container, onSelect, history)` + card builder |
| `huggingface.js` | `renderHFCards(data, container, onSelect, history)` + card builder |
| `spaces.js` | `renderSpacesCards(data, container, onSelect, history)` + card builder |
| `index.js` | All UI wiring: tabs, card selection, velocity chart per tab, WebMCP tool registration (`registerWebMCPTools`) |

## Data flow

1. GitHub Action runs `scripts/fetch.js` every 3 hours
2. Script writes `data/github.json` and `data/huggingface.json`
3. Action commits and pushes with `[skip ci]`
4. Static page fetches `data/*.json` on load

## Local development

```bash
# Fetch data once
node scripts/fetch.js

# Serve (required — fetch() won't work over file://)
python3 -m http.server 8080
# or
npx serve .
```

## Adding a new tool

1. Add an entry to `TOOL_DEFS` in `tools.js` (name, description, trust hints, JSON schema, `execute` handler)
2. It registers automatically via `registerWebMCPTools()` in `index.js`

## GitHub Action notes

- Workflow has `concurrency` set to prevent overlapping runs
- Commit skipped (via `git diff --staged --quiet`) if data hasn't changed
- `[skip ci]` in commit message prevents triggering another workflow run
- Manual trigger available via `workflow_dispatch` in GitHub UI

## External signals to watch

Sources earlier in the disruption pipeline than GitHub trending. Candidates for integration *and* competitive radar — pulse exists partly to keep its author on top of these.

- **AI-native dev tools** — v0, Bolt, Lovable, Replit Agent, Cursor, Claude Code. Direct competitors to how this project itself gets built.
- **Coding agents** — Devin, OpenHands, SWE-agent, Cline. "Is my workflow obsolete?" radar.
- **MCP + tool-use frameworks** — substrate layer for agent capability.
- **HF Spaces trending** — applied AI surfacing before it hits GitHub stars.
- **Product surfaces** — ProductHunt, YC launches. Packaged products, not libraries.
- **Research upstream** — arxiv-sanity, Papers with Code trending. Predicts model releases.

## Direction notes

- Velocity is now first-class: `data/history.json` tracks per-item observations over 90 days, surfaced as a top-of-tab horizontal bar chart (ECharts) and per-card sparklines (plain SVG to avoid a chart instance per card).
- The next move under consideration is **chat-driven LLM-synthesized visualization** via a migration to [`pip`](../pip) (UI chat primitives). Justification: pulse currently can't render structured turn content like inline charts cleanly. Wait until the velocity chart earns its keep before taking that on.
- Filter > sources. Adding sources without a stronger filter is noise. An external agent driving the view (via the WebMCP tool surface) against user context is where pulse differentiates from generic aggregators.

### Visualization guidance (visual-epistemology)

- Time windows must be labeled. Velocity chart shows the actual observed span ("57d"), not a presumed window.
- Sparklines omit axes by design — they encode *shape*, not values. Hover surfaces the delta + span in a `<title>`.
- Bars start at zero (delta encoding requires it). Lines (sparklines) do not.
- LLM-generated themes/clusters, when added, are model output — must be visibly distinguishable from raw observations and must keep source items reachable.
