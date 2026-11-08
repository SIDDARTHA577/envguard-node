/**
 * Architecture Report & Architecture Decision Record (ADR) Generator.
 * Compiles reviewable ADR drafts grounded in empirical evidence and requirements.
 */

/**
 * Generates Architecture Decision Record (ADR) drafts from findings and design decisions.
 *
 * @param {object} inventory - Output from buildArchitectureInventory()
 * @param {object} requirements - Output from discoverArchitectureRequirements()
 * @param {object[]} evaluations - Output from evaluateSystemDesignDecisions()
 * @returns {object[]} Array of structured ADR documents
 */
export function generateArchitectureDecisionRecords(inventory, requirements, evaluations) {
  const adrs = [];

  for (const evalItem of evaluations) {
    // Generate ADR for defective or recommended architectural items
    if (evalItem.status === 'DEFECTIVE' || evalItem.status === 'OVERENGINEERED' || (evalItem.status === 'RECOMMENDED' && evalItem.finding)) {
      adrs.push(createAdrForConcept(evalItem, inventory, requirements));
    }
  }

  return adrs;
}

/**
 * Creates an individual structured ADR document.
 */
function createAdrForConcept(evalItem, inventory, requirements) {
  const concept = evalItem.conceptId;
  const isOverengineered = evalItem.status === 'OVERENGINEERED';

  let title = `ADR: Adopt ${evalItem.name}`;
  let problem = `Application currently lacks robust ${evalItem.name.toLowerCase()} implementation, creating availability and performance risks.`;
  let recommendation = `Implement ${evalItem.name} according to standard production patterns.`;

  if (isOverengineered) {
    title = `ADR: Consolidate / Simplify ${evalItem.name}`;
    problem = `Application currently implements ${evalItem.name.toLowerCase()} which exceeds the operational necessity of the current workload and team size (${requirements.teamSize}).`;
    recommendation = `Evaluate simplifying architecture into a modular monolith or direct routing to reduce cognitive and infrastructure overhead.`;
  }

  const adr = {
    id: `ADR-${concept.toUpperCase().replace(/_/g, '-')}`,
    title,
    status: 'PROPOSED_DRAFT',
    date: new Date().toISOString().split('T')[0],
    context: `Project architecture type is "${inventory.topologyType}" with ${inventory.counts.services} backend services and ${inventory.counts.clients} clients. Team size is characterized as ${requirements.teamSize}. Availability SLA target is ${requirements.availability?.target || '99.9%'}.`,
    currentArchitecture: `Current implementation state for ${evalItem.name}: ${evalItem.isImplemented ? 'Detected in codebase' : 'Not detected'}.`,
    problem,
    constraints: [
      `Budget posture: ${requirements.hostingBudget}`,
      `Team operational capacity: ${requirements.teamSize}`,
      `Zero disruption to existing database transactions and user sessions`,
    ],
    alternativesConsidered: evalItem.alternatives || ['Status quo (accept current risk profile)', 'Third-party managed cloud service offloading'],
    decisionRecommendation: recommendation,
    expectedBenefits: [
      evalItem.problemSolved,
      'Improves reliability and aligns with senior system engineering standards',
      'Minimizes single point of failure exposure',
    ],
    costs: evalItem.costs || 'Low to moderate engineering time and cloud instance fees',
    risks: evalItem.risksAndFailureModes || ['Misconfiguration leading to false positive blocking or latency spikes'],
    securityImplications: evalItem.securityConsequences || 'Maintains least-privilege boundary and protects backend datastores',
    performanceImplications: `Aims to keep tail latency within target (${requirements.latencyTarget?.p95Ms || 200}ms p95).`,
    operationalImplications: `Operational maintenance overhead rated as ${evalItem.operationalOverhead}.`,
    migrationStrategy: [
      '1. Implement required configuration or code changes in isolated branch',
      '2. Validate in staging environment with synthetic load testing',
      '3. Deploy to production behind feature flag or canary deployment with gradual traffic ramp',
    ],
    rollbackStrategy: 'Revert deployment commit and restore previous routing configuration; zero database schema alteration required.',
    evidenceNeededBeforeAcceptance: [
      evalItem.validationMethod || 'Load test verification under staging conditions',
      'Zero regressions in existing test suites',
      'Explicit review and approval by repository maintainer',
    ],
  };

  return adr;
}

/**
 * Formats architecture assessment findings and ADRs into Markdown for reports.
 *
 * @param {object} architectureData - Complete architecture audit payload
 * @returns {string} Markdown section
 */
export function formatArchitectureMarkdown(architectureData) {
  if (!architectureData) return '';

  const { inventory, requirements, evaluations, adrs, capacityModel } = architectureData;

  let md = `## 8. Senior System Architecture & Engineering Review\n\n`;

  // Topology overview
  md += `### Architecture Topology Overview\n`;
  md += `- **Topology Classification**: \`${inventory.topologyType}\`\n`;
  md += `- **Identified Services**: ${inventory.counts.services} backend service(s), ${inventory.counts.clients} client application(s)\n`;
  md += `- **Datastores & Queues**: ${inventory.counts.datastores} datastore(s), ${inventory.counts.queues} message queue(s)\n`;
  md += `- **Detected Technologies**: ${inventory.detectedTechnologies.join(', ') || 'Standard Node.js'}\n\n`;

  // System design concept evaluation table
  md += `### System Design Decision Matrix (17 Mandatory Dimensions)\n\n`;
  md += `| Concept | Status | Implemented | Operational Overhead | Key Consideration |\n`;
  md += `| :--- | :---: | :---: | :---: | :--- |\n`;

  for (const item of evaluations) {
    const badge =
      item.status === 'HEALTHY'
        ? '`PASS`'
        : item.status === 'DEFECTIVE'
        ? '`DEFECTIVE`'
        : item.status === 'OVERENGINEERED'
        ? '`OVERENGINEERED`'
        : item.status === 'RECOMMENDED'
        ? '`RECOMMENDED`'
        : '`N/A`';
    md += `| **${item.name}** | ${badge} | ${item.isImplemented ? 'Yes' : 'No'} | ${item.operationalOverhead || 'low'} | ${truncate(item.problemSolved, 60)} |\n`;
  }
  md += `\n`;

  // Capacity planning section
  if (capacityModel) {
    const s10k = capacityModel.hypothetical10kScenario;
    md += `### Capacity Planning & Workload Projections\n\n`;
    md += `> [!NOTE]\n`;
    md += `> ${s10k.disclaimer}\n\n`;
    md += `- **Workload Evaluation State**: \`${capacityModel.workloadState}\`\n`;
    md += `- **10,000-VU Projected Peak Throughput**: ${s10k.parameters.projectedPeakRps} req/s\n`;
    md += `- **Recommended Database Max Pool Limit**: ${capacityModel.resourceProjections.recommendedDatabasePoolSize?.perInstanceMax || 20} per instance\n`;
    md += `- **Recommended Compute Replicas**: ${capacityModel.resourceProjections.recommendedComputeReplicas} container instances\n\n`;
  }

  // Architecture Decision Records (ADRs)
  if (adrs && adrs.length > 0) {
    md += `### Proposed Architecture Decision Records (ADRs)\n\n`;
    for (const adr of adrs) {
      md += `#### ${adr.title} (${adr.id})\n`;
      md += `- **Context**: ${adr.context}\n`;
      md += `- **Problem**: ${adr.problem}\n`;
      md += `- **Recommendation**: ${adr.decisionRecommendation}\n`;
      md += `- **Operational Implications**: ${adr.operationalImplications}\n`;
      md += `- **Rollback Strategy**: ${adr.rollbackStrategy}\n\n`;
    }
  }

  return md;
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}
