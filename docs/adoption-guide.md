# Measuring Genuine Open-Source Adoption & Impact

> **Maintainer Guide**: How to measure and report real usage, downloads, dependencies, and community engagement for `envguard-node` using authoritative, verifiable sources.

---

## 1. Verifiable Data Sources

When tracking project growth, never fabricate numbers or rely on unverified estimates. Use these primary official sources:

### A. npm Registry Metrics
- **Package API**: Query official npm download statistics directly from the registry:
  ```bash
  # Total downloads in the last 30 days
  curl -s "https://api.npmjs.org/downloads/point/last-month/envguard-node"
  
  # Daily download progression
  curl -s "https://api.npmjs.org/downloads/range/last-month/envguard-node"
  ```
- **Web UI**: `https://www.npmjs.com/package/envguard-node`
- **npm Trends**: `https://npmtrends.com/envguard-node` (comparative adoption against alternative packages).

### B. Dependent Packages & Repositories
- **GitHub Network Dependents**: Check the official dependency graph:
  `https://github.com/SIDDARTHA577/envguard-node/network/dependents`
- **Libraries.io**: Tracks ecosystem dependents across public registries:
  `https://libraries.io/npm/envguard-node`

### C. GitHub Community & Engagement
- **Traffic Insights**: Inspect weekly unique cloners and repository visitors under **Insights > Traffic** in the GitHub repository.
- **Unique External Contributors**:
  ```bash
  # List unique commit authors excluding maintainer and bots
  git log --format='%aN <%aE>' | sort -u
  ```
- **Merged Community Pull Requests**:
  ```bash
  gh pr list --state merged --search "is:pr is:merged -author:SIDDARTHA577"
  ```

---

## 2. Responsible Metrics Reporting

When citing project adoption in grants, applications, or public presentations:

1. **State the Exact Timeframe**: Always anchor download metrics to a specific date range (e.g., "15,000 monthly downloads measured via npm registry API as of October 2026").
2. **Exclude Automated CI Traffic Where Feasible**: Be aware that automated CI matrix tests generate download counts; distinguish high-volume robot downloads from unique developer installations.
3. **Distinguish Baseline from Milestones**: Clearly state when a package is newly released (version 1.0.0) versus an established library with verified production dependents.

