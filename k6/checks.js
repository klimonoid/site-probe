import http from 'k6/http';
import exec from 'k6/execution';
import { Counter, Rate, Trend } from 'k6/metrics';
import { cfg, cellName } from './load-config.js';

const KNOWN_STATUSES = [
  0, 200, 201, 204, 301, 302, 303, 304, 307, 308, 400, 401, 403, 404, 405, 408, 409, 410, 418, 421,
  429, 451, 500, 501, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 530,
];

const statusCounters = {};
for (const code of KNOWN_STATUSES) statusCounters[code] = new Counter('status_' + code);
const statusOther = new Counter('status_other');
const challengeHits = new Counter('challenge_hits');
const challengeRate = new Rate('challenge_rate');
const non200Rate = new Rate('non200_rate');
const ttfb = new Trend('ttfb', true);

function headerValue(res, name) {
  const headers = res && res.headers ? res.headers : {};
  const want = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (String(key).toLowerCase() === want) {
      const value = headers[key];
      return Array.isArray(value) ? value.join(',') : String(value || '');
    }
  }
  return '';
}

function isChallenge(res) {
  if (headerValue(res, 'cf-mitigated')) return true;
  const body = String((res && res.body) || '').slice(0, 12000).toLowerCase();
  if (!body) return false;
  const markers = [
    'just a moment',
    'cf-browser-verification',
    '/cdn-cgi/challenge-platform/',
    'challenges.cloudflare.com',
    'attention required',
    'enable javascript and cookies to continue',
    'checking your browser',
    'sorry, you have been blocked',
    'cf-error-details',
    'error code: 1020',
    'error code: 1015',
    'error code: 1006',
    'error code: 1010',
  ];
  for (const marker of markers) {
    if (body.indexOf(marker) !== -1) return true;
  }
  return body.indexOf('access denied') !== -1 && (body.indexOf('cloudflare') !== -1 || headerValue(res, 'cf-ray'));
}

function recordStatus(code) {
  const counter = statusCounters[code];
  if (counter) counter.add(1);
  else statusOther.add(1);
}

export default function () {
  const seq = exec.scenario.iterationInTest;
  const url = cfg.urls[seq % cfg.urls.length];
  const agent = cfg.userAgents[Math.floor(seq / cfg.urls.length) % cfg.userAgents.length];
  const res = http.get(url, {
    redirects: 0,
    timeout: '30s',
    headers: {
      'User-Agent': agent.ua,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,fa;q=0.8',
    },
    tags: { name: url, ua: agent.name },
  });
  const body = String(res.body || '');
  const challenged = isChallenge(res);
  recordStatus(res.status);
  if (challenged) challengeHits.add(1);
  challengeRate.add(challenged);
  non200Rate.add(res.status !== 200);
  if (res.status !== 0 && res.timings) ttfb.add(res.timings.waiting);
  console.log(
    JSON.stringify({
      cell: cellName,
      url: url,
      ua: agent.name,
      status: res.status,
      ttfb_ms: res.timings && res.timings.waiting ? Math.round(res.timings.waiting) : 0,
      body_size: body.length,
      challenge: challenged,
      error: res.status === 0 ? String(res.error || '') : '',
    }),
  );
}

function metricCount(data, name) {
  const metric = data.metrics[name];
  if (!metric || !metric.values || !metric.values.count) return 0;
  return metric.values.count;
}

function fmtMs(values, key) {
  if (!values || values[key] === undefined || values[key] === null) return 'n/a';
  const n = Number(values[key]);
  if (!isFinite(n)) return 'n/a';
  return n.toFixed(1);
}

export function handleSummary(data) {
  const parts = [];
  for (const code of KNOWN_STATUSES) {
    const count = metricCount(data, 'status_' + code);
    if (count) parts.push(code + '=' + count);
  }
  const other = metricCount(data, 'status_other');
  if (other) parts.push('other=' + other);
  const ttfbValues = data.metrics.ttfb && data.metrics.ttfb.values;
  const lines = [
    cellName + ' summary',
    'requests ' + metricCount(data, 'http_reqs'),
    'status_counts ' + (parts.join(' ') || 'none'),
    'challenge_hits ' + metricCount(data, 'challenge_hits'),
    'ttfb_ms p50=' + fmtMs(ttfbValues, 'p(50)') + ' p95=' + fmtMs(ttfbValues, 'p(95)'),
    'dropped_iterations ' + metricCount(data, 'dropped_iterations'),
  ];
  const thresholdNotes = [];
  for (const name of Object.keys(data.metrics).sort()) {
    const row = data.metrics[name];
    if (!row || !row.thresholds) continue;
    for (const expr of Object.keys(row.thresholds)) {
      const item = row.thresholds[expr];
      const ok = item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'ok') ? item.ok : item;
      thresholdNotes.push(name + ' ' + expr + ' ok=' + ok);
    }
  }
  if (thresholdNotes.length) lines.push('thresholds ' + thresholdNotes.join('; '));
  const text = lines.join('\n') + '\n';
  return {
    stdout: text,
    ['/results/' + cellName + '.txt']: text,
    ['/results/' + cellName + '.json']: JSON.stringify(data, null, 2),
  };
}
