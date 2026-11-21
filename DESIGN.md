# Design

Design context for Lantern's UI. Read before any design work.

## Design Context

### Users

One user per install, at a desk during an active job search. lantern is a
local-first, single-machine job-search harness running at `localhost:3000`.
It is used in **bursts** at a desk during an active job search — type a role
in plain English, wait for the scan, then triage the resulting jobs (accept / shortlist /
reject, read LLM verdicts, open the posting). Mental state is **focused and
slightly invested** (the outcome matters), so the UI must reduce friction and
never add anxiety or noise. Desktop-first; not a mobile product.

The job to be done, in order of frequency:
1. **Triage jobs** — scan a potentially large list (hundreds–thousands after a
   a ~460-board run), read each one's fit, decide quickly. This is where the user
   spends most of their time. It must be fast and calm.
2. **Run a search** — type the role in plain English (Claude turns it into
   criteria, shown back as "understood as" chips), watch live scan progress,
   get to the results. The search box is the single central affordance of the
   whole product.
3. **Tune settings** — occasional: the Matching, Pipeline, Sources and System
   panels, including per-task model overrides. There is no criteria editor;
   criteria come from the query.

### Brand Personality

**Refined · premium · minimal.** A quiet, exacting instrument — not a product
demo, not a SaaS dashboard. It should feel like a well-made tool the user
trusts: every element earns its place, nothing decorative for its own sake.
Warmth comes from the palette and type, not from playfulness. Voice in copy:
plain, precise, unhurried. No exclamation marks, no marketing tone.

### Aesthetic Direction

- **Theme:** Both light and dark, **light default**. Light is the primary
  design target (long triage-reading sessions at a desk); dark is a
  first-class alternative, not an afterthought. (Resolves Phase-8 Open Q#5.)
- **The "lantern glow" accent:** a single **warm amber/ember** accent, on-theme
  with the product name (`--accent`, `--accent-text`). Used rarely (the 10% in
  60-30-10) — for the primary action, focus rings, the scan progress, the
  search affordance, strong scores. Never as a fill across many elements. A
  secondary coral/clay (`--accent-2`) is used sparingly for italic highlights.
- **Warm neutrals:** every neutral tinted toward the amber hue (OKLCH, hue
  ~75, chroma ~0.006–0.017) so surfaces feel of a piece with the accent. No
  pure black, no pure white, no cool gray.
- **Ambient light:** a decorative layer of soft orbs, blobs, embers and rings
  (`--orb-*`, `--blob-*`, `--ember`, `--ring-stroke`) pools warm light on the
  search hero and page backgrounds; on light paper it is multiplied in, so it
  reads as light rather than smudges. Strong fit scores glow faintly. Scores
  follow a heat ramp from ash to lantern gold (`scoreColor()`).
- **Typography:**
  All self-hosted via `@fontsource-variable` (`ui/src/main.tsx`), tokens in
  `ui/src/styles/globals.css`.
  - Display (h1, the search hero, the hero count, the job title in detail):
    **Bodoni Moda** — high-contrast display serif for big moments only.
  - Sub-headings (h2–h4, job-row titles): **Source Serif 4** — humanist text
    serif.
  - UI / body / dense lists: **Hanken Grotesk** — warm humanist grotesque,
    excellent at small sizes; `.tnum` for tabular figures.
  - Mono (data: IDs, URLs, scores, counts, timestamps, scan meta): **Spline
    Sans Mono**. Mono is NOT used as decorative "developer vibes" — only for
    data.
- **Anti-references (explicitly avoid):**
  - The **old** lantern look (the earlier look): indigo/purple (`#6366f1`) accent
    on near-black `#0a0a0a` with Inter + JetBrains Mono — textbook AI-slop
    palette. Gone from the code; don't let it creep back.
  - Generic AI dashboard: card-grid soup, gradient text, glass cards, glowing
    neon-on-dark, sparklines-as-decoration, an icon-in-a-rounded-square above
    every heading, side-stripe colored borders on rows. Backdrop blur is only
    for floating layers (toasts, the command palette overlay, sticky bars).
  - Crowded / cluttered density that makes triage feel heavy.
  - Anything janky — motion and large-list scrolling must be smooth.

### Design Principles

1. **The search box is the hero.** The plain-English role query is the single most
   important affordance in the product and should be visually central wherever
   it appears, especially on entry. Everything downstream is a consequence of it.
2. **Calm density.** Job triage shows a lot of rows; achieve scannability
   through typographic hierarchy, alignment, generous-but-consistent rhythm, and
   tabular numerals — NOT through boxes, stripes, or color. Flatten containers.
3. **Earn every element.** Refined-minimal means subtraction. No element,
   border, shadow, icon, or animation ships unless it does a job. When unsure,
   remove it.
4. **Warmth through restraint.** Personality comes from one warm accent, warm
   neutrals, and considered type — applied sparingly. Rare accents stay powerful.
5. **Smooth above flashy.** Motion is purposeful and fast (one well-orchestrated
   moment beats scattered micro-interactions); large lists must stay performant
   with thousands of jobs. Never sacrifice smoothness for delight.
