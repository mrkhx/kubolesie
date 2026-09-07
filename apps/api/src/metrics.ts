/** Process-local counters. Reset on restart. Not durable analytics. */

export interface ProcessMetrics {
  vkCallbackErrors: number;
  vkSendErrors: number;
  dbErrors: number;
  rateLimitedRequests: number;
  adminEndpointRequests: number;
}

const counts: ProcessMetrics = {
  vkCallbackErrors: 0,
  vkSendErrors: 0,
  dbErrors: 0,
  rateLimitedRequests: 0,
  adminEndpointRequests: 0,
};

const startedAt = Date.now();

export function incMetric(name: keyof ProcessMetrics, by = 1): void {
  counts[name] += by;
}

export function snapshotMetrics(): ProcessMetrics & { durable: false; note: string } {
  return {
    ...counts,
    durable: false,
    note: 'process-local counters reset on redeploy/restart',
  };
}

export function processUptimeSec(): number {
  return Math.floor((Date.now() - startedAt) / 1000);
}

export function resetMetricsForTests(): void {
  counts.vkCallbackErrors = 0;
  counts.vkSendErrors = 0;
  counts.dbErrors = 0;
  counts.rateLimitedRequests = 0;
  counts.adminEndpointRequests = 0;
}
