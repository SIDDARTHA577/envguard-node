---
name: envguard-accessibility
description: Guides auditing and implementation of accessible web interfaces aligned with WCAG 2.1/2.2 AA standards, semantic HTML, keyboard navigation, focus management, color contrast, and ARIA patterns.
---

# `envguard-accessibility` Skill

Guides engineers and AI agents in designing, implementing, and verifying fully accessible web interfaces. Aligns applications with WCAG 2.1 and WCAG 2.2 AA criteria, semantic HTML structure, keyboard navigation, focus management, color contrast standards, and accessible rich internet applications (ARIA) design patterns.

## When to Trigger
- Auditing web applications, React components, or templates for WCAG 2.1 / 2.2 AA compliance.
- Implementing or verifying keyboard navigation, tab order, focus traps, and visible focus rings.
- Evaluating color contrast ratios for text, icons, interactive controls, and disabled elements.
- remediating inaccessible forms (unassociated labels, missing error announcements, unannounced validation).
- Correcting ARIA misuse, redundant roles, unannounced dynamic content updates (`aria-live`), and screen reader traps.
- Ensuring compliance with reduced motion preferences (`prefers-reduced-motion`) and touch target sizes.

## When NOT to Trigger
- Designing high-level backend architecture or database schemas (use `envguard-system-design` or `envguard-database`).
- Writing raw server-side Node.js business logic, Express routes, or database queries (use `envguard-backend`).
- Auditing environment configuration or deployment secrets (use `envguard-audit` or `envguard-review`).
- Conducting general code reviews where accessibility is only a minor incidental consideration (use `envguard-code-review`).

## Supported Projects & Environments
- Frameworks: React, Next.js, Vite, Vue, Svelte, Angular, HTML5 / Vanilla JS.
- Testing & Linting Tools: axe-core, @axe-core/react, jest-axe, ESLint (`eslint-plugin-jsx-a11y`), Playwright Accessibility (axe).
- Assistive Technologies: NVDA, JAWS, VoiceOver (macOS / iOS), TalkBack (Android).
- Standards: W3C WCAG 2.1 / 2.2 Level AA, WAI-ARIA 1.2 Authoring Practices Guide (APG).

## Required Tools & Permissions
- Tools: File reader, file writer, test runner (`read_file`, `write_file`, `run_command`).
- Permissions: Project workspace read and write permissions to inspect UI templates, modify components, and run accessibility test suites.

## Expected Inputs
- Frontend component files (`.tsx`, `.jsx`, `.html`, `.vue`, `.svelte`).
- Styling stylesheets, CSS modules, or Tailwind configuration.
- Target user interaction scenarios (modals, dropdowns, forms, accordion, pagination, toast notifications).

## Step-by-Step Workflow

### Step 1: Semantic HTML First (POUR Principles)
- Prioritize native semantic HTML elements before applying ARIA attributes:
  - Use `<button>` for actions and `<a>` for navigation. Never attach `onClick` handlers to `<div>` or `<span>` without keyboard handlers, roles, and focusability.
  - Structure pages with landmark regions: `<header>`, `<nav>`, `<main>`, `<aside>`, and `<footer>`.
  - Maintain a logical heading hierarchy (`<h1>` through `<h6>`) without skipping levels (e.g. do not jump from `<h1>` to `<h3>`).
  - Use `<ul>` / `<ol>` for lists, `<table>` with `<th>` for tabular data, and `<dialog>` for modal overlays.

### Step 2: Keyboard Operability & Focus Management
- Ensure 100% of interactive functionality is operable via keyboard alone:
  - **Tab Order**: Follow natural reading order (left-to-right, top-to-bottom). Avoid positive `tabIndex` values (`tabIndex > 0` is an anti-pattern); use `tabIndex={0}` for custom focusable elements and `tabIndex={-1}` for programmatically focused containers.
  - **Focus Indicators**: Never set `outline: none` or `outline: 0` without providing an equally visible, high-contrast alternative (e.g. `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600`).
  - **Modal Dialog Focus Traps**: When a modal or dialog opens:
    1. Trap keyboard focus within the dialog; pressing Tab on the last element wraps to the first.
    2. Close dialog on `Escape` key press.
    3. Return focus to the triggering element when the dialog closes.
    4. Set `aria-modal="true"` and `role="dialog"` or `role="alertdialog"`.
  - **Skip Links**: Provide a "Skip to main content" link as the first focusable element on every page.

### Step 3: Color Contrast & Sensory Perception
- Verify color contrast ratios against WCAG 2.1/2.2 AA standards:
  - **Normal Text (< 18pt or < 14pt bold)**: Minimum 4.5:1 contrast against background.
  - **Large Text (>= 18pt or >= 14pt bold)**: Minimum 3.0:1 contrast against background.
  - **UI Components & Graphical Objects**: Minimum 3.0:1 contrast for input borders, icons, and focus rings against adjacent background colors.
  - **Color as Sole Indicator**: Never rely solely on color to convey status, errors, or required fields. Always pair color with text labels, icons, or patterns.

### Step 4: Accessible Forms & Dynamic Validation
- Implement accessible form patterns:
  - Explicitly associate every input with a `<label>` via `htmlFor="field-id"` and `id="field-id"`.
  - Group related fields (e.g. radio buttons, checkboxes) using `<fieldset>` and `<legend>`.
  - Connect error messages and helper text to inputs using `aria-describedby="error-id helper-id"`.
  - Flag invalid fields with `aria-invalid="true"`.
  - Announce dynamic form errors using `aria-live="polite"` or `role="alert"` so screen readers inform the user immediately upon validation failure.

### Step 5: ARIA Patterns & Live Regions
- Follow the First Rule of ARIA: "If you can use a native HTML element or attribute with the semantics and behavior already built in, do so instead of re-purposing an element and adding ARIA."
- When ARIA is required:
  - Use `aria-expanded="true|false"` on disclosure triggers (accordions, dropdown menus).
  - Use `aria-controls="target-id"` to identify controlled panels.
  - Use `aria-current="page"` on active navigation links.
  - Announce toasts and asynchronous updates with `aria-live="polite"` (or `aria-live="assertive"` for critical alerts).

### Step 6: Responsive & Motion Accessibility
- Verify touch targets meet the minimum size requirement: at least 24x24 CSS pixels for WCAG 2.2 Level AA (44x44 CSS pixels recommended).
- Respect user motion preferences by honoring `@media (prefers-reduced-motion: reduce)` to disable non-essential animations.
- Ensure text can be resized up to 200% without loss of content or functionality and without horizontal scrolling.

## Validation Steps
- Run automated accessibility linters (e.g. `npx eslint` with `jsx-a11y` rules) to verify clean static checks.
- Test keyboard navigation across all views using only `Tab`, `Shift+Tab`, `Enter`, `Space`, and `Escape`.
- Verify contrast ratios using automated color analyzers or Lighthouse Accessibility audits (target score 100).
- Verify that screen readers announce dynamic errors and dialog closures accurately.

## Expected Outputs
- Fully accessible React/HTML components with semantic elements and proper ARIA bindings.
- Accessible form controls with visible labels, `aria-describedby`, and live error announcements.
- Modal focus trap and keyboard dismissal implementations.
- Accessibility audit report identifying violations, WCAG criteria references, and remediation code.

## Failure Handling
- If third-party UI libraries lack accessible markup, wrap them in accessible containers, supply necessary ARIA attributes, or replace them with accessible alternatives (e.g. Radix UI or Headless UI).
- If design specifications fail color contrast requirements, recommend the closest compliant shade that preserves brand identity.

## Safety & Privacy Boundaries
- Accessibility attributes must NEVER expose sensitive user credentials, masked password values, or personal identification in `aria-label` or live announcements.
- Always test with simulated or synthetic data; never capture real user screen-reader sessions containing private information.

## Example User Prompts
- "Audit our React task management components for WCAG 2.1 AA accessibility with envguard-accessibility"
- "Implement a fully accessible modal dialog with keyboard focus trap and Escape key dismissal"
- "Fix form accessibility by associating labels, adding aria-describedby for errors, and checking color contrast"
