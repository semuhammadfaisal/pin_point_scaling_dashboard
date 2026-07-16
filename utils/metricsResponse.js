function successResponse(filters, summary = {}, data = []) {
  return {
    success: true,
    filters,
    summary,
    data,
    generatedAt: new Date().toISOString(),
  };
}

function errorResponse(filters, code, message, details = []) {
  return {
    success: false,
    filters: filters || {},
    summary: {},
    data: [],
    generatedAt: new Date().toISOString(),
    error: { code, message, details },
  };
}

module.exports = { successResponse, errorResponse };
