function successResponse(filters, summary = {}, data = [], meta = {}) {
  return {
    success: true,
    filters,
    summary,
    data,
    generatedAt: new Date().toISOString(),
    source: meta.source || 'canonical_v1',
    sourceAsOf: meta.sourceAsOf || null,
    freshnessSeconds: meta.freshnessSeconds ?? null,
    certification: meta.certification || 'unverified',
    qualityIssues: Array.isArray(meta.qualityIssues) ? meta.qualityIssues : [],
  };
}

function errorResponse(filters, code, message, details = []) {
  return {
    success: false,
    filters: filters || {},
    summary: {},
    data: [],
    generatedAt: new Date().toISOString(),
    source: null,
    sourceAsOf: null,
    freshnessSeconds: null,
    certification: 'unverified',
    qualityIssues: [],
    error: { code, message, details },
  };
}

module.exports = { successResponse, errorResponse };
