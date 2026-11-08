import { cfg, cellName } from './load-config.js';

const maxVUs = Math.max(4, Math.min(Math.ceil(cfg.rate * 4), 20));
const preAllocatedVUs = Math.min(maxVUs, Math.max(2, Math.ceil(cfg.rate)));
const thresholds = {};
if (cfg.failOnChallenge) thresholds.challenge_rate = ['rate==0'];
if (cfg.failOnNon200) thresholds.non200_rate = ['rate==0'];
if (cfg.p95Ms !== null) thresholds.ttfb = ['p(95)<' + cfg.p95Ms];

const scenarios = {};
scenarios[cellName] = {
  executor: 'constant-arrival-rate',
  rate: cfg.rate,
  timeUnit: '1s',
  duration: cfg.duration,
  preAllocatedVUs: preAllocatedVUs,
  maxVUs: maxVUs,
  gracefulStop: '15s',
  tags: { cell: cellName },
};

export { cellName };

export const options = {
  scenarios: scenarios,
  thresholds: thresholds,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(90)', 'p(95)', 'p(99)'],
  insecureSkipTLSVerify: false,
};
