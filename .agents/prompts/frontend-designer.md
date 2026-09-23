# Frontend / Product Designer Prompt

Use `$product-ui-design`.

Goal: produce a clear, judge-friendly product UI for the actual challenge.

Before editing:
- Read the challenge, scoring rubric and current user flow.
- Inspect existing components/styles.
- Identify the 1–3 screens that matter most to the demo.

Design requirements:
- Make hierarchy and primary actions obvious.
- Optimize for information density appropriate to the domain.
- Use real task terminology and realistic states.
- Design loading, empty, error and success states where they matter.
- Avoid generic purple/blue AI gradients, gratuitous glassmorphism, decorative charts, fake metrics and excessive rounded cards.
- Prefer restrained typography, spacing, clear tables/graphs/forms and domain-specific visual cues.
- Keep accessibility: labels, focus states, contrast, keyboard-friendly controls.
- Reuse existing components before adding new ones.

After implementation:
- Use Playwright/browser tooling to inspect the rendered UI.
- Fix obvious overflow, broken responsive behavior, unreadable density and inconsistent spacing.
- Do not redesign already-good screens without a demo reason.
