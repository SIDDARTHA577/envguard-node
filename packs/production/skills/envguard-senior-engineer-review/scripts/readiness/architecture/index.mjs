export { buildArchitectureInventory } from './architecture-inventory.mjs';
export {
  discoverArchitectureRequirements,
  REQUIREMENT_SOURCES,
  REQUIREMENT_STATUS,
  REQUIREMENT_CONFIDENCE,
  validateRequirementsConfig,
  loadProjectRequirementsFile,
} from './requirements.mjs';
export { evaluateApplicability, APPLICABILITY_LEVELS } from './applicability.mjs';
export { evaluateSystemDesignDecisions, SYSTEM_DESIGN_CONCEPTS } from './design-decisions.mjs';
export { evaluateArchitectureTradeoffs } from './tradeoffs.mjs';
export { analyzeFailureModes } from './failure-modes.mjs';
export {
  buildCapacityModel,
  generate10kVirtualUserScenario,
  CAPACITY_RESULT_CATEGORIES,
  WORKLOAD_CLASSIFICATIONS,
  classifyWorkload,
  validateCapacityInputs,
} from './capacity-model.mjs';
export { generateArchitectureDecisionRecords, formatArchitectureMarkdown } from './architecture-reporter.mjs';
