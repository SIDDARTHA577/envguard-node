/**
 * Skill Selection and Prioritization Engine for EnvGuard.
 * Evaluates repository inventory, platforms, and detected technologies to dynamically
 * recommend, prioritize, and sequence applicable Agent Skills from the 18-skill catalog.
 */

export const SKILL_PRIORITIES = {
  P0: 'P0', // Foundation / Critical assessment
  P1: 'P1', // Platform & Domain hardening
  P2: 'P2', // Enhancement & Operational refinement
};

/**
 * Recommends and sequences Agent Skills based on project topology and technology stack.
 *
 * @param {object} inventory - Repository inventory graph from buildInventoryGraph()
 * @param {string[]} [files=[]] - List of relative project files
 * @returns {{ selectedSkills: Array<object>, executionSequence: string[] }}
 */
export function selectSkillsForProject(inventory = {}, files = []) {
  const applications = inventory.applications || [];
  const isMonorepo = Boolean(inventory.repository?.isMonorepo);
  const selected = [];

  // Technology & architecture detection helpers
  const allDeps = new Set();
  const allDevDeps = new Set();
  const allAppTypes = new Set();

  for (const app of applications) {
    if (app.type) allAppTypes.add(app.type);
    const deps = app.dependencies || {};
    const devDeps = app.devDependencies || {};
    for (const d of Object.keys(deps)) allDeps.add(d);
    for (const d of Object.keys(devDeps)) allDevDeps.add(d);
  }

  const hasMobile =
    allAppTypes.has('react-native') ||
    allAppTypes.has('flutter') ||
    allAppTypes.has('android') ||
    allAppTypes.has('ios') ||
    files.some(
      (f) =>
        f.startsWith('android/') ||
        f.startsWith('ios/') ||
        f.endsWith('pubspec.yaml') ||
        f.endsWith('App.tsx') ||
        f.endsWith('app.json')
    );

  const hasBackend =
    allAppTypes.has('node-typescript') ||
    allAppTypes.has('python') ||
    allAppTypes.has('java') ||
    allDeps.has('express') ||
    allDeps.has('fastify') ||
    allDeps.has('nestjs') ||
    allDeps.has('@nestjs/core') ||
    allDeps.has('koa') ||
    files.some(
      (f) =>
        f.includes('server.') ||
        f.includes('app.') ||
        f.endsWith('manage.py') ||
        f.endsWith('pom.xml') ||
        f.endsWith('build.gradle')
    );

  const hasFrontend =
    allAppTypes.has('nextjs-react') ||
    allDeps.has('react') ||
    allDeps.has('next') ||
    allDeps.has('vue') ||
    allDeps.has('svelte') ||
    allDevDeps.has('vite') ||
    files.some((f) => f.includes('pages/') || f.includes('components/') || f.endsWith('index.html'));

  const hasDatabase =
    allDeps.has('prisma') ||
    allDevDeps.has('prisma') ||
    allDeps.has('@prisma/client') ||
    allDeps.has('typeorm') ||
    allDeps.has('sequelize') ||
    allDeps.has('mongoose') ||
    allDeps.has('pg') ||
    allDeps.has('mysql2') ||
    allDeps.has('better-sqlite3') ||
    files.some((f) => f.includes('schema.prisma') || f.includes('migrations/') || f.includes('models/'));

  const hasMissingEnvExample = !files.some((f) => f === '.env.example' || f.endsWith('/.env.example'));
  const hasCI = files.some(
    (f) => f.startsWith('.github/') || f.includes('.gitlab-ci.yml') || f.includes('Dockerfile')
  );

  // 1. Foundation Skills (P0 - Always Selected)
  selected.push({
    name: 'envguard-production-readiness',
    pack: 'production',
    priority: SKILL_PRIORITIES.P0,
    reason: 'Comprehensive multi-platform production readiness audit covering configuration, security, builds, and reliability.',
    triggers: ['always_active', 'foundation_readiness'],
  });

  selected.push({
    name: 'envguard-senior-engineer-review',
    pack: 'production',
    priority: SKILL_PRIORITIES.P0,
    reason: 'Senior software architect review evaluating system design, ADRs, FMEA risk analysis, and capacity planning.',
    triggers: ['always_active', 'architecture_orchestration'],
  });

  selected.push({
    name: 'envguard-review',
    pack: 'core',
    priority: SKILL_PRIORITIES.P0,
    reason: 'Security analysis of environment variables, secret handling, gitignore rules, and credential leak risks.',
    triggers: ['always_active', 'security_audit'],
  });

  // 2. Setup & Environment Remediation Skills
  if (hasMissingEnvExample) {
    selected.push({
      name: 'envguard-setup',
      pack: 'core',
      priority: SKILL_PRIORITIES.P0,
      reason: 'No .env.example template detected. Automated generation of environment schema and safe template required.',
      triggers: ['missing_env_example'],
    });
  }

  selected.push({
    name: 'envguard-audit',
    pack: 'core',
    priority: SKILL_PRIORITIES.P1,
    reason: 'Scans codebase for environment variable lookups and recommends type-safe EnvGuard schemas.',
    triggers: ['configuration_audit'],
  });

  if (hasCI) {
    selected.push({
      name: 'envguard-ci',
      pack: 'core',
      priority: SKILL_PRIORITIES.P1,
      reason: 'Existing CI/CD configuration detected. Integration of automated pre-flight readiness checks recommended.',
      triggers: ['ci_pipeline_detected'],
    });
  }

  // 3. Domain & Architecture Skills
  selected.push({
    name: 'envguard-system-design',
    pack: 'fullstack',
    priority: SKILL_PRIORITIES.P1,
    reason: 'System architecture selection, component boundaries, and Architecture Decision Records (ADRs).',
    triggers: ['system_architecture'],
  });

  selected.push({
    name: 'envguard-code-review',
    pack: 'fullstack',
    priority: SKILL_PRIORITIES.P1,
    reason: 'Rigorous peer code review for edge cases, performance bottlenecks, and architectural alignment.',
    triggers: ['code_quality_assurance'],
  });

  if (hasBackend) {
    selected.push({
      name: 'envguard-backend',
      pack: 'fullstack',
      priority: SKILL_PRIORITIES.P1,
      reason: 'Backend API implementation with input validation, structured errors, and graceful shutdown.',
      triggers: ['backend_service_detected'],
    });
    selected.push({
      name: 'envguard-api-design',
      pack: 'fullstack',
      priority: SKILL_PRIORITIES.P1,
      reason: 'Standardized RESTful API contracts with explicit HTTP semantics and RFC 7807 structured errors.',
      triggers: ['api_endpoints_detected'],
    });
    selected.push({
      name: 'envguard-load-test',
      pack: 'production',
      priority: SKILL_PRIORITIES.P2,
      reason: 'Capacity planning, workload scenario modeling, and safe local benchmarking for backend services.',
      triggers: ['load_testing_eligible'],
    });
  }

  if (hasFrontend) {
    selected.push({
      name: 'envguard-frontend',
      pack: 'fullstack',
      priority: SKILL_PRIORITIES.P1,
      reason: 'Component-driven frontend implementation with strict state management and API integration.',
      triggers: ['frontend_ui_detected'],
    });
    selected.push({
      name: 'envguard-accessibility',
      pack: 'fullstack',
      priority: SKILL_PRIORITIES.P1,
      reason: 'WCAG AA standards, semantic HTML, keyboard navigation, and ARIA patterns.',
      triggers: ['accessibility_applicable'],
    });
    selected.push({
      name: 'envguard-ui-design',
      pack: 'fullstack',
      priority: SKILL_PRIORITIES.P2,
      reason: 'Token-driven user interfaces with standardized typography and spacing scales.',
      triggers: ['ui_design_consistency'],
    });
  }

  if (hasDatabase) {
    selected.push({
      name: 'envguard-database',
      pack: 'fullstack',
      priority: SKILL_PRIORITIES.P1,
      reason: 'Database schema design, composite index strategies, migrations, and connection pool optimization.',
      triggers: ['database_persistence_detected'],
    });
  }

  if (isMonorepo || (hasBackend && hasFrontend)) {
    selected.push({
      name: 'envguard-fullstack-integration',
      pack: 'fullstack',
      priority: SKILL_PRIORITIES.P1,
      reason: 'Full-stack integration connecting frontends, backends, and databases with shared TypeScript contracts.',
      triggers: ['cross_boundary_integration'],
    });
  }

  if (hasMobile) {
    selected.push({
      name: 'envguard-mobile-readiness',
      pack: 'production',
      priority: SKILL_PRIORITIES.P0,
      reason: 'Mobile application readiness assessment for React Native, Expo, Flutter, Android, and iOS aligned with OWASP MASVS.',
      triggers: ['mobile_platform_detected'],
    });
  }

  // Deduplicate and order by priority (P0 -> P1 -> P2), then by name
  const priorityOrder = { P0: 0, P1: 1, P2: 2 };
  const seen = new Set();
  const uniqueSelected = [];

  for (const s of selected) {
    if (!seen.has(s.name)) {
      seen.add(s.name);
      uniqueSelected.push(s);
    }
  }

  uniqueSelected.sort((a, b) => {
    const pDiff = (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99);
    if (pDiff !== 0) return pDiff;
    return a.name.localeCompare(b.name);
  });

  return {
    selectedSkills: uniqueSelected,
    executionSequence: uniqueSelected.map((s) => s.name),
  };
}

