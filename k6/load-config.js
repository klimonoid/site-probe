function fail(message) {
  throw new Error(message);
}

function integer(value, label) {
  if (!/^[1-9][0-9]*$/.test(value)) fail('Refusing to start: ' + label + ' must be a positive integer.');
  return Number(value);
}

function flag(value, label) {
  if (value === '1') return true;
  if (value === '0') return false;
  fail('Refusing to start: ' + label + ' must be 1 or 0.');
}

function fileName(value, suffix, label) {
  const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp('^[A-Za-z0-9][A-Za-z0-9._-]*' + escaped + '$');
  if (!pattern.test(value)) fail('Refusing to start: ' + label + ' must be a file name ending in ' + suffix + '.');
  return value;
}

function proxyUrl(name) {
  const value = __ENV[name] || '';
  if (!/^(https?|socks5):\/\/\S+$/i.test(value)) {
    fail('Refusing to start: ' + name + ' must be an http, https, or socks5 URL.');
  }
  return value;
}

const siteFile = fileName(__ENV.SITE_FILE || '', '.json', 'SITE_FILE');
const uaFile = fileName(__ENV.UA_FILE || '', '.json', 'UA_FILE');
const cellName = __ENV.CELL || '';
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(cellName)) {
  fail('Refusing to start: CELL must be a file stem like proxy1-dancebet-default.');
}

const httpProxy = proxyUrl('HTTP_PROXY');
const httpsProxy = proxyUrl('HTTPS_PROXY');
if (httpProxy !== httpsProxy) fail('Refusing to start: HTTP_PROXY and HTTPS_PROXY must be the same URL.');

const rate = integer(__ENV.RATE || '', 'rate');
if (rate > 1 && __ENV.ALLOW_HIGHER_RATE !== '1') {
  fail('Refusing to start: rate=' + rate + ' is above the 1 request/sec probe. Set ALLOW_HIGHER_RATE to 1 to allow it.');
}
const duration = __ENV.DURATION || '';
if (!/^[0-9]+(\.[0-9]+)?(ms|s|m|h)$/.test(duration)) {
  fail('Refusing to start: duration must look like 30s or 3m.');
}

function jsonArray(path, label) {
  let parsed;
  try {
    parsed = JSON.parse(open(path));
  } catch (error) {
    fail('Refusing to start: ' + label + ' must be a JSON array.');
  }
  if (!Array.isArray(parsed) || !parsed.length) fail('Refusing to start: ' + label + ' must be a non-empty JSON array.');
  return parsed;
}

const urls = jsonArray('/config/sites/' + siteFile, 'site file').map(function (item) {
  if (typeof item !== 'string' || !/^https?:\/\/\S+$/.test(item)) {
    fail('Refusing to start: each site entry must be an http(s) URL.');
  }
  return item;
});
const userAgents = jsonArray('/config/user-agents/' + uaFile, 'user-agent file').map(function (item) {
  const name = item && typeof item.name === 'string' ? item.name.trim() : '';
  const ua = item && typeof item.ua === 'string' ? item.ua.trim() : '';
  if (!name || !ua) fail('Refusing to start: each user agent needs a name and a ua.');
  return { name: name, ua: ua };
});

const failOnChallenge = flag(__ENV.FAIL_ON_CHALLENGE || '', 'FAIL_ON_CHALLENGE');
const failOnNon200 = flag(__ENV.FAIL_ON_NON200 || '', 'FAIL_ON_NON200');
const p95Raw = __ENV.P95_MS || '';
const p95Ms = p95Raw === '' ? null : integer(p95Raw, 'P95_MS');

export const cfg = {
  rate: rate,
  duration: duration,
  urls: urls,
  userAgents: userAgents,
  failOnChallenge: failOnChallenge,
  failOnNon200: failOnNon200,
  p95Ms: p95Ms,
  cellName: cellName,
  siteFile: siteFile,
  uaFile: uaFile,
};

export { cellName };
