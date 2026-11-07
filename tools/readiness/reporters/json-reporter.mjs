/**
 * Generates structured JSON readiness report conformant to catalog/readiness-report.schema.json.
 */
export function formatJsonReport(report) {
  return JSON.stringify(report, null, 2);
}
