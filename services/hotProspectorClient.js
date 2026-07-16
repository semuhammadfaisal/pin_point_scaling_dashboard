const axios = require('axios');
const config = require('../config/hotProspector');
const authService = require('./hotProspectorAuthService');
const { logApiError } = require('../utils/apiLogger');

const client = axios.create({
  baseURL: config.baseUrl,
  timeout: config.timeoutMs,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryable(error) {
  const status = error.response?.status;
  return !error.response || status === 408 || status === 429 || status >= 500;
}

function retryDelay(error, attempt) {
  const retryAfterHeader = Number(error.response?.headers?.['retry-after']);
  if (Number.isFinite(retryAfterHeader) && retryAfterHeader >= 0) {
    return Math.min(60000, retryAfterHeader * 1000);
  }
  const message = String(error.response?.data?.message || error.message || '');
  const statedDelay = Number(message.match(/try again in\s+(\d+)\s*seconds?/i)?.[1]);
  if (Number.isFinite(statedDelay) && statedDelay >= 0) {
    return Math.min(60000, statedDelay * 1000);
  }
  return Math.min(500 * 2 ** attempt, 5000);
}

async function request(endpointKey, payload = {}) {
  const endpoint = config.endpoints[endpointKey];
  if (!endpoint) throw new Error(`Unknown Hot Prospector endpoint definition: ${endpointKey}`);

  let authRenewed = false;
  let lastError;
  for (let attempt = 0; attempt <= config.retries + 1; attempt += 1) {
    try {
      const accessToken = await authService.getAccessToken({ forceRefresh: authRenewed });
      const response = await client.post(
        config.requestPath,
        { Method: endpoint.method, ...payload },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      const authFailure = String(response.data?.message || '').toLowerCase().match(/invalid|expired/) &&
        String(response.data?.response).toLowerCase() === 'false';
      if (authFailure && !authRenewed) {
        lastError = new Error(response.data?.message || 'Hot Prospector access token was rejected.');
        authRenewed = true;
        authService.invalidateAccessToken();
        continue;
      }
      return response.data;
    } catch (error) {
      lastError = error;
      if (error.response?.status === 401 && !authRenewed) {
        authRenewed = true;
        authService.invalidateAccessToken();
        continue;
      }
      if (error.response?.status === 429 && attempt >= 1) break;
      if (attempt >= config.retries || !retryable(error)) break;
      await sleep(retryDelay(error, attempt));
    }
  }

  const finalError = lastError || new Error(`Hot Prospector ${endpoint.method} request failed.`);
  logApiError(finalError, { endpointKey, method: endpoint.method });
  throw finalError;
}

module.exports = { request };
