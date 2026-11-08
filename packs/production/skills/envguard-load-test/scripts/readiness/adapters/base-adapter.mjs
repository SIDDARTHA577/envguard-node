/**
 * Versioned Base Adapter Contract for EnvGuard Multi-Platform Assessment Engine.
 */
export class BaseAdapter {
  /**
   * @param {object} config
   * @param {string} config.id - Unique identifier for the adapter (e.g. 'generic', 'node-typescript', 'nextjs-react')
   * @param {string} config.name - Human-readable name
   * @param {string} config.version - Semantic version of the adapter contract
   * @param {string} config.description - Summary of adapter assessment scope
   * @param {string[]} [config.supportedLanguages] - List of supported languages
   * @param {string[]} [config.supportedFrameworks] - List of supported frameworks
   * @param {string[]} [config.requiredTools] - External tools required (e.g. ['git', 'node'])
   */
  constructor({
    id,
    name,
    version,
    description = '',
    supportedLanguages = [],
    supportedFrameworks = [],
    requiredTools = [],
  }) {
    if (!id || typeof id !== 'string') {
      throw new Error('BaseAdapter requires a non-empty string id');
    }
    if (!name || typeof name !== 'string') {
      throw new Error('BaseAdapter requires a non-empty string name');
    }
    if (!version || typeof version !== 'string') {
      throw new Error('BaseAdapter requires a semantic version string');
    }

    this.id = id;
    this.name = name;
    this.version = version;
    this.description = description;
    this.supportedLanguages = supportedLanguages;
    this.supportedFrameworks = supportedFrameworks;
    this.requiredTools = requiredTools;
  }

  /**
   * Evaluates if this adapter applies to a target application node in the inventory graph.
   * @param {object} target - Target application node from inventory graph
   * @param {object} context - { projectDir, files, inventory, config }
   * @returns {{ matched: boolean, confidence: number, reason: string, metadata?: object }}
   */
  detect(target, context) {
    throw new Error(`detect() not implemented in adapter "${this.id}"`);
  }

  /**
   * Returns list of capabilities supported by this adapter.
   * @returns {string[]}
   */
  getCapabilities() {
    return [];
  }

  /**
   * Returns list of check descriptors applicable to this target.
   * @param {object} target - Target application node
   * @param {object} context - Global assessment context
   * @returns {Array<{ id: string, name: string, category: string, description: string, required?: boolean }>}
   */
  getApplicableChecks(target, context) {
    return [];
  }

  /**
   * Executes static checks for the target.
   * @param {object} target - Target application node
   * @param {object} context - Global assessment context
   * @returns {Promise<Array<object>> | Array<object>}
   */
  runStaticChecks(target, context) {
    return [];
  }

  /**
   * Executes dynamic checks for the target (requires authorized runner).
   * @param {object} target - Target application node
   * @param {object} context - Global assessment context
   * @param {object} execRunner - Authorized execution runner
   * @returns {Promise<Array<object>> | Array<object>}
   */
  runDynamicChecks(target, context, execRunner) {
    return [];
  }

  /**
   * Returns known limitations of this adapter.
   * @returns {string[]}
   */
  getLimitations() {
    return [];
  }

  /**
   * Helper to format a standardized finding object conforming to catalog/readiness-report.schema.json.
   */
  createFinding({
    id,
    checkId,
    category,
    status,
    severity = 'info',
    title,
    explanation,
    evidence = null,
    checkMethod = 'static_analysis',
    recommendation = '',
    manualVerificationRequired = false,
    confidence = 'verified_fact',
    targetPath = '.',
  }) {
    return {
      id,
      checkId: checkId || id,
      toolName: `envguard-adapter-${this.id}`,
      toolVersion: this.version,
      adapterId: this.id,
      targetPath,
      category,
      status,
      severity,
      title,
      explanation,
      evidence,
      checkMethod,
      recommendation,
      manualVerificationRequired,
      confidence,
    };
  }
}
