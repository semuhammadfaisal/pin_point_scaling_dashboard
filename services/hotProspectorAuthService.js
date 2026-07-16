const axios = require('axios');
const env = require('../config/env');
const config = require('../config/hotProspector');
const { logApiError } = require('../utils/apiLogger');

const authClient = axios.create({
  baseURL: config.baseUrl,
  timeout: config.timeoutMs,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

let tokenCache = null;
let tokenRequest = null;

function cacheToken(payload) {
  const data = payload?.data || payload;
  if (!data?.access_token) throw new Error('Hot Prospector token response did not include an access token.');
  tokenCache = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokenCache?.refreshToken || null,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 21600) - 60) * 1000,
  };
  return tokenCache.accessToken;
}

async function generateToken() {
  const response = await authClient.post(config.tokenPath, {
    api_uId: env.hotProspector.uid,
    api_key: env.hotProspector.apiKey,
  });
  return cacheToken(response.data);
}

async function refreshToken() {
  if (!tokenCache?.refreshToken) return generateToken();
  try {
    const response = await authClient.post(config.refreshPath, { refresh_token: tokenCache.refreshToken });
    return cacheToken(response.data);
  } catch (error) {
    logApiError(error, { operation: 'refresh_token' });
    tokenCache = null;
    return generateToken();
  }
}

async function getAccessToken(options = {}) {
  const { forceRefresh = false } = options;
  if (!forceRefresh && tokenCache?.accessToken && tokenCache.expiresAt > Date.now()) {
    return tokenCache.accessToken;
  }

  if (!tokenRequest) {
    tokenRequest = (forceRefresh ? refreshToken() : tokenCache?.refreshToken ? refreshToken() : generateToken())
      .finally(() => {
        tokenRequest = null;
      });
  }
  return tokenRequest;
}

function invalidateAccessToken() {
  if (tokenCache) tokenCache.expiresAt = 0;
}

function clearTokenCache() {
  tokenCache = null;
}

module.exports = { getAccessToken, invalidateAccessToken, clearTokenCache };
