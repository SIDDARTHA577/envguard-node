---
name: envguard-ui-design
description: Guides the design and implementation of cohesive, token-driven user interfaces with standardized typography, spacing scales, responsive layout grids, component anatomy, and design system consistency.
---

# `envguard-ui-design` Skill

Guides engineers and AI agents in creating visually unified, accessible, and responsive user interfaces powered by structured design tokens, consistent spatial systems, and modular component architectures.

## When to Trigger
- Defining, auditing, or refactoring design tokens (color palettes, typography scale, spacing units, elevation shadows, border radii).
- Establishing responsive grid layouts, breakpoints (mobile, tablet, desktop, wide), and fluid container hierarchies.
- Designing or standardizing component anatomy for buttons, inputs, modals, cards, data tables, dashboards, and navigation bars.
- Reviewing user interface implementations for visual hierarchy, rhythm, consistent spacing, and theme alignment (light/dark mode).
- Standardizing empty states, loading indicators, skeleton screens, and actionable error alert views across a design system.

## When NOT to Trigger
- Implementing backend routes, business logic, or database transactions (use `envguard-backend` or `envguard-database`).
- Auditing environment variables or deployment secrets (use `envguard-audit` or `envguard-review`).
- Conducting deep WCAG screen reader compliance audits or assistive technology testing (use `envguard-accessibility`).
- Designing high-level distributed systems architecture (use `envguard-system-design`).

## Supported Projects & Environments
- Frameworks: React, Next.js, Vite, Vue, Svelte, Astro, HTML5.
- Styling Technologies: Tailwind CSS, CSS Modules, styled-components, CSS custom properties (variables), Sass.
- Design Systems: Radix UI, Headless UI, shadcn/ui, Material UI, Chakra UI, Ant Design, custom token systems.
- Iconography & Typography: Lucide React, Heroicons, Google Fonts, Inter, System font stacks.

## Required Tools & Permissions
- Tools: File reader, file writer, test runner (`read_file`, `write_file`, `run_command`).
- Permissions: Project workspace read and write permissions to inspect, create, and modify style tokens, component templates, and UI assets.

## Expected Inputs
- Existing project styling stack (`tailwind.config.js`, `theme.css`, `tokens.json`, or CSS module files).
- Target view requirements (e.g. data dashboard, CRUD management table, authentication form, metric cards).
- Brand or theme parameters (primary hues, semantic intent colors, base font family, dark mode requirements).

## Step-by-Step Workflow

### Step 1: Design Token System Definition
Establish a 3-tier token architecture:
1. **Global / Primitive Tokens**: Raw values independent of usage context:
   - Colors: Neutral grays (50-950), brand primaries (50-950), semantic scales (success green, warning amber, error red, info blue).
   - Spacing: 4px/8px modular base scale (`2` = 8px, `3` = 12px, `4` = 16px, `6` = 24px, `8` = 32px, `12` = 48px).
   - Typography: Font families, font weights (400, 500, 600, 700), font sizes (`xs` 12px, `sm` 14px, `base` 16px, `lg` 18px, `xl` 20px, `2xl` 24px, `3xl` 30px) with matched line heights.
   - Radii: `none` (0px), `sm` (4px), `md` (8px), `lg` (12px), `full` (9999px).
   - Shadows: Subtle, elevation-based ambient and key light pairs.
2. **Semantic / Alias Tokens**: Purpose-driven references:
   - `color.background.canvas`, `color.background.surface`, `color.background.elevated`.
   - `color.text.primary`, `color.text.secondary`, `color.text.muted`, `color.text.inverse`.
   - `color.border.default`, `color.border.subtle`, `color.border.focus`.
3. **Component Tokens**: Specific component bindings referencing semantic tokens.

### Step 2: Responsive Grid & Layout Foundations
- Configure standard responsive breakpoints:
  - `sm`: 640px (mobile landscape / small tablet).
  - `md`: 768px (tablet portrait).
  - `lg`: 1024px (tablet landscape / laptop).
  - `xl`: 1280px (standard desktop).
  - `2xl`: 1536px (wide display).
- Implement responsive layout containers with fluid padding (`px-4 sm:px-6 lg:px-8`) and max widths (`max-w-7xl mx-auto`).
- Use CSS Grid and Flexbox for fluid, content-aware arrangement without fixed pixel widths that break on small screens.

### Step 3: Component Anatomy & Visual Hierarchy
- Design UI components with consistent structural anatomy:
  - **Buttons**: Clear visual weight hierarchy (Primary, Secondary, Outline, Ghost, Destructive). Consistent height scales (sm: 32px, md: 40px, lg: 48px) with proportional horizontal padding.
  - **Form Controls**: Distinct border styles, visible focus rings, label placement above controls, helper text below, and inline validation error callouts.
  - **Cards & Containers**: Crisp border demarcation (`1px solid var(--border)`), subtle corner radii, and padding proportional to viewport size.
  - **Tables & Lists**: Sticky headers, alternating row hover highlights, clear alignment (numbers right-aligned, text left-aligned, status badges centered), and responsive overflow scrolling.

### Step 4: State-Driven Visual Feedback
- Provide explicit, visually distinct representations for every component state:
  - **Default / Idle**: Resting state with standard contrast.
  - **Hover**: Subtle background brightness change or border tint (avoid layout shifts).
  - **Focus-Visible**: Distinct 2px high-contrast outline with 2px offset.
  - **Active / Pressed**: Subtle scale or shade darkening to confirm tactile click.
  - **Disabled**: Reduced opacity (40-60%) and `cursor-not-allowed` without losing readability.
  - **Loading Skeleton**: Shimmering pulse placeholder matching actual text and box dimensions to eliminate cumulative layout shift (CLS).
  - **Empty State**: Centered illustration or icon, concise heading, descriptive body text, and a primary call-to-action button.

### Step 5: Light & Dark Mode Theming
- Implement dark mode using CSS variables or class-based switching (`.dark`).
- Avoid pure black (`#000000`) for dark mode surfaces; use dark slate/neutral grays (`#0f172a` or `#18181b`) to reduce eye strain and preserve depth perception.
- Ensure text contrast remains at or above 4.5:1 against the active surface background in both light and dark themes.

## Validation Steps
- Verify that zero hardcoded, arbitrary hex colors or magic pixel values exist outside the token definition files.
- Inspect layouts at 320px, 768px, 1024px, and 1440px viewport widths to verify absence of horizontal scrollbars or clipped content.
- Validate that focus indicators are visible on all interactive elements across light and dark themes.
- Test loading-to-success transitions to verify zero cumulative layout shift (CLS < 0.1).

## Expected Outputs
- Structured design token definitions (`tokens.ts` or `tokens.json`).
- Updated component stylesheets or Tailwind theme extension.
- Polished, responsive component implementations with consistent spacing and typography.
- Documentation of component variants, token usages, and responsive behavior.

## Failure Handling
- If existing project code contains conflicting ad-hoc styling, introduce semantic tokens incrementally without breaking existing layouts.
- If contrast falls below accessibility standards, automatically adjust the token scale luminance while preserving brand hue.

## Safety & Privacy Boundaries
- UI styles must NEVER embed sensitive data, environment keys, API tokens, or user credentials in CSS, inline attributes, or SVG assets.
- Design files and component templates must use synthetic placeholder text (e.g. "Acme Corp", "jane@example.com") rather than real user data.

## Example User Prompts
- "Standardize our design tokens and color palette with envguard-ui-design"
- "Create a responsive dashboard layout with metric cards and a data table using our design system"
- "Audit our components for consistent spacing, typography scale, and dark mode support"

