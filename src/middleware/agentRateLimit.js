const windows = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = Number(process.env.AGENT_RATE_LIMIT_PER_MINUTE || 15);

function agentRateLimit(req, res, next) {
  const key = req.user && req.user.userId ? req.user.userId : req.ip;
  const now = Date.now();
  const existing = windows.get(key);
  const entry = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + WINDOW_MS }
    : existing;
  entry.count += 1;
  windows.set(key, entry);

  if (entry.count > MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Too many agent requests. Please wait a moment and try again.',
      code: 'AGENT_RATE_LIMITED',
    });
  }
  return next();
}

module.exports = agentRateLimit;
