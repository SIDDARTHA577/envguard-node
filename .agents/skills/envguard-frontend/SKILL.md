---
name: envguard-frontend
description: Guides the development of responsive, component-driven React and TypeScript frontend applications with strict state management, API integration, form validation, accessible loading/error/empty states, and unit testing.
---

# `envguard-frontend` Skill

Guides the implementation and refinement of professional, accessible, and responsive React and TypeScript frontend applications.

## When to Trigger
- Building or refactoring React components, pages, forms, and layouts.
- Integrating client applications with RESTful backend APIs.
- Managing client state, data fetching, loading spinners, empty states, and error alerts.
- Implementing client-side form validation with accessible feedback.
- Writing unit and component tests with React Testing Library or Vitest.

## When NOT to Trigger
- Writing backend Express routes or middleware (use `envguard-backend`).
- Designing database tables or SQL migrations (use `envguard-database`).
- Conducting high-level system design (use `envguard-system-design`).

## Supported Projects & Environments
- Frameworks & Bundlers: React 18/19, Vite, Next.js (App Router / Pages Router), Remix, Astro.
- Languages: TypeScript, modern JavaScript (ESM).
- Styling: Tailwind CSS, CSS Modules, styled-components, vanilla CSS.
- Testing: Vitest, Jest, React Testing Library, Playwright.

## Required Tools & Permissions
- Tools: File reader, file writer, test runner (`read_file`, `write_file`, `run_command`).
- Permissions: Project workspace read and write permissions to update UI components and styles.

## Expected Inputs
- Existing UI framework and build tooling (`vite.config.ts`, `next.config.js`, `package.json`).
- Target view requirements (forms, lists, detail modals, responsive breakpoints).
- Backend API endpoints and response schemas.

## Step-by-Step Workflow

### Step 1: Framework & Tooling Inspection
- Inspect `package.json` to identify existing React version, bundler (Vite or Next.js), and styling library.
- **Rule**: Do NOT replace the user's chosen UI library, styling approach, or bundler without clear technical justification.

### Step 2: Component Architecture & Separation of Concerns
- Organize components into clean, single-responsibility units:
  - Presentational components (stateless rendering, accessible DOM elements).
  - Container / feature components (data fetching, state, event handlers).
  - Custom hooks for reusable API fetching and state logic.

### Step 3: Implement Complete State Lifecycle
- Every view interacting with async API calls MUST handle four explicit states:
  1. **Loading State**: Accessible skeleton or spinner while data is fetching.
  2. **Empty State**: Friendly, actionable message when zero records exist.
  3. **Success State**: Data rendered with proper keys, semantic elements, and responsive layout.
  4. **Error State**: Informative error message with a retry button, without exposing backend stack traces.

### Step 4: Form Handling & Client-Side Validation
- Implement controlled or uncontrolled forms with immediate user validation.
- Associate all inputs with `<label>` elements via `htmlFor`/`id`.
- Display inline field errors with `aria-describedby` and `aria-invalid`.

### Step 5: Responsive Design & Accessibility
- Ensure layout responds smoothly across mobile (<640px), tablet (640-1024px), and desktop (>1024px).
- Verify keyboard navigation: all interactive elements (buttons, links, inputs) must be reachable via Tab and show visible focus indicators.

### Step 6: Frontend Component Testing
- Write automated tests with React Testing Library or Vitest verifying:
  - Component renders initial loading state.
  - Success state displays fetched data.
  - Error state displays error alert when API rejects.
  - Form submission triggers expected callback or API call.

## Validation Steps
- Execute `npm run typecheck` to verify zero TypeScript errors.
- Execute `npm test` to verify frontend component tests pass.
- Verify that client build artifacts (`dist/` or `.next/`) contain ZERO private environment variables or secrets.

## Expected Outputs
- Fully typed React components with responsive layout.
- Custom hook or API client handling async state.
- Form validation with accessible error messaging.
- Component tests verifying user interactions.

## Failure Handling
- If API calls fail, catch errors gracefully and display the error state rather than crashing the component tree.
- Use React Error Boundaries to prevent unhandled UI crashes.

## Safety & Privacy Boundaries
- **NEVER** expose backend secrets (database URLs, server private keys) in frontend code or client environment bundles (`VITE_*`, `NEXT_PUBLIC_*`).
- Client builds must only receive public configuration (e.g. `VITE_API_BASE_URL`).

## Example User Prompts
- "Build a responsive task list and creation form in React with envguard-frontend"
- "Add loading, error, and empty states to our data-fetching components"
- "Write component tests with React Testing Library verifying task completion toggles"
