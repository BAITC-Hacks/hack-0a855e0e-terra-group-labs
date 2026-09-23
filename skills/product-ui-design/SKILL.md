---
name: product-ui-design
description: Design, implement, and visually verify a distinctive, task-specific, production-like hackathon UI that maximizes clarity, demo value, and domain fit.
---

# Product UI Design

Act as the product designer and frontend engineer for a judged hackathon product. The goal is not to make a generic “AI-looking” interface. The goal is to make the task understandable within seconds, make the primary workflow obvious, and give the demo one memorable, domain-specific visual idea.

The challenge brief and scoring rubric outrank this skill. If they imply a specific audience, visual language, platform, accessibility requirement, or interaction model, follow them.

## 1. Ground the design in the actual challenge

Before writing UI code, identify:

- **Primary user:** who is using this product?
- **Primary job:** what are they trying to accomplish?
- **Demo moment:** what should a judge understand or experience in the first 20–40 seconds?
- **Core evidence:** what output proves the product worked?
- **Domain language:** use the challenge's real terminology rather than generic AI terms.
- **Decision density:** is this a dashboard, investigation workspace, workflow, form, report, graph explorer, chat, or something else?

Do not invent extra product areas merely to make the interface look complete.

If requirements are ambiguous, choose the smallest product interpretation that makes the judged workflow coherent and record the assumption in the handoff.

## 2. Design the information architecture first

Identify the minimum screens or views needed for the end-to-end demo.

For each view define:

- primary user question;
- primary action;
- most important information;
- supporting information;
- loading state;
- empty state if meaningful;
- failure/recovery state if meaningful;
- success/completion state.

Prefer one strong workspace over several weak pages.

Choose the UI structure that matches the domain:

- table for comparison and scan-heavy structured data;
- graph/network for relationships;
- timeline for events over time;
- split view for source/evidence + analysis;
- form/workflow for guided input;
- map only when geography matters;
- chart only when a quantitative pattern matters;
- chat only when conversational interaction is genuinely useful.

Do not convert everything into cards.

## 3. Create a compact design direction before implementation

Write a short design plan in the task handoff before coding.

Include:

### Visual concept
One sentence describing what makes the interface feel specific to this product.

### Palette
Define 4–6 named colors with hex values and roles:
- page/background;
- surface;
- primary text;
- secondary text;
- accent/action;
- semantic danger/success only when needed.

Use the domain to inform color. Do not default to purple/blue “AI” gradients.

### Typography
Choose one or two font families already available to the project or safely obtainable under event constraints.

Define roles:
- display/title;
- section heading;
- body;
- labels/data.

Use a deliberate scale and weight hierarchy. Avoid arbitrary all-caps micro-labels and decorative monospace text unless the domain actually benefits from them.

Keep long-form text readable; avoid excessively wide text blocks.

### Shape and spacing
Define a small token system:
- spacing rhythm;
- border radius strategy;
- borders/dividers;
- shadows, if any.

Do not give every container the same rounded rectangle treatment.

### Layout
Describe the desktop demo layout and include a tiny ASCII wireframe when the layout is non-trivial.

Example:

```text
┌─────────────────────────────────────────────────────────┐
│ Header / case selector / primary action                │
├───────────────────┬─────────────────────────────────────┤
│ Filters / context │ Main evidence / graph / workspace  │
│                   │                                     │
├───────────────────┴─────────────────────────────────────┤
│ Findings / explanation / next action                   │
└─────────────────────────────────────────────────────────┘
```

### Memorable element
Choose at most one visually distinctive element that expresses the domain: a graph interaction, investigation timeline, evidence trail, live result transition, spatial layout, or similarly meaningful device.

Spend visual boldness there and keep the rest restrained.

## 4. Run an anti-template critique before coding

Ask whether the plan could be reused almost unchanged for an unrelated SaaS or AI dashboard.

If yes, revise it.

Common generated-design tells to avoid unless the brief specifically calls for them:

- generic hero with a gradient headline and three KPI cards;
- purple/blue neon AI palette;
- decorative glow and glassmorphism;
- identical rounded cards for unrelated content;
- fake KPI values or charts created only to fill space;
- a sidebar full of non-functional destinations;
- excessive badges and pills;
- all-caps eyebrow labels above every heading;
- gratuitous monospace metadata;
- arrows appended to every link/button;
- repeated fade/slide animations on every section;
- decorative numbered steps when the content is not actually sequential;
- stock “AI assistant” copy when the product is really a domain tool.

Every visual device must either improve hierarchy, interaction, comprehension, or domain identity.

## 5. Implementation rules

- Reuse existing components and tokens when they are good enough.
- Prefer simple component structure over a large design-system refactor during the hackathon.
- Do not add a UI framework only for aesthetics unless it materially accelerates implementation.
- Use semantic HTML and real controls.
- Buttons must perform visible actions.
- Inputs need labels or an equivalent accessible name.
- Preserve visible keyboard focus.
- Respect reduced-motion preferences for non-essential motion.
- Use icons consistently and only where they clarify meaning.
- Avoid layout that depends on one exact content length.
- Do not hide important information behind hover-only interactions.
- Keep the primary demo path usable at the expected projector/laptop viewport.
- If mobile is not part of the challenge, still prevent catastrophic overflow; do not spend disproportionate time on a full mobile redesign.

## 6. Product copy is part of the design

Write from the user's perspective, not the implementation's perspective.

Prefer:
- concrete verbs;
- sentence case;
- short labels;
- consistent names for the same action;
- specific errors that say what failed and what the user can do next.

Examples:
- “Generate report” rather than “Submit”.
- “Couldn’t load transactions. Retry the import.” rather than “Something went wrong.”
- “No relationships found for these filters” rather than an empty blank panel.

Do not use marketing filler to compensate for weak product substance.

## 7. Data visualization rules

Only add a visualization when it answers a question.

Before adding a chart/graph, state:
- what question it answers;
- what data drives it;
- what interaction the demo needs;
- what happens when data is missing or extreme.

Never fabricate analytical evidence and present it as real product output.

Use labels, legends, tooltips, scales, and units only as needed for comprehension.

For network/graph UIs:
- distinguish node/edge meaning clearly;
- expose selection/focus state;
- prevent unreadable label collisions where practical;
- provide a table/details fallback for precise values;
- make the judge-visible insight obvious without requiring exploration.

## 8. Browser verification is mandatory

After implementing the first coherent UI:

1. Start the app using the documented project commands.
2. Use Playwright/browser tooling to open the actual rendered UI.
3. Capture or inspect the main demo screen.
4. Critique it as a screenshot, not as source code.
5. Fix the most visible problems first.
6. Repeat until the demo path is visually stable.

Verify at minimum:

- no horizontal overflow at the demo viewport;
- no clipped menus/modals/tooltips;
- readable typography and contrast;
- consistent alignment and spacing;
- correct loading/empty/error/success states on the primary path;
- obvious primary action;
- real data/evidence is visually distinguishable from placeholder/demo data;
- buttons and navigation used in the demo actually work;
- no console-breaking frontend errors on the primary path.

If time allows, perform one secondary viewport check.

## 9. Self-critique pass

Before declaring the UI done, answer:

- What is the first thing the judge notices?
- Can the core product purpose be understood within 5–10 seconds?
- Is the primary action obvious?
- Is there one memorable domain-specific element?
- Is any element present only because “dashboards usually have one”?
- Is any copy generic or implementation-centric?
- Are there fake controls, dead destinations, decorative metrics, or visual clutter?
- Would removing one decorative element improve clarity?

Remove unnecessary decoration before adding new decoration.

## 10. Stop condition

Stop when:
- the core judged flow is clear;
- the UI visibly supports the product's actual value;
- the browser-verified demo path is stable;
- important states are understandable;
- no high-impact visual defect remains.

Do not spend final hackathon time redesigning already-good screens merely to make them different.
