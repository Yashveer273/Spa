// Vercel runs this for every /api/... request (see vercel.json).
// It only points to the real backend in backend/server.js – the same code as `npm start`.
//
// If the server code can't even start (for example a setting is missing in Vercel),
// every API call answers with the reason instead of a bare "500" – and /api/health
// lists which settings this deployment can see (yes/no only, never the values).

const REQUIRED = ['MONGODB_URI', 'SESSION_SECRET', 'ADMIN_USERNAME', 'ADMIN_PASSWORD'];
const settingsSeen = () => Object.fromEntries(REQUIRED.map((k) => [k, Boolean(process.env[k])]));

let handler = null;
let loadError = null;
try {
  handler = require('../backend/server');
} catch (e) {
  loadError = e;
  console.error('Server code failed to start:', e);
}

function sendJSON(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

module.exports = (req, res) => {
  if (loadError) {
    const missing = REQUIRED.filter((k) => !process.env[k]);
    return sendJSON(res, 500, {
      error: missing.length
        ? `Server setup problem: missing ${missing.join(', ')} in Vercel → Settings → Environment Variables (then redeploy).`
        : `Server setup problem: ${loadError.message}`,
      settings: settingsSeen(),
    });
  }
  return handler(req, res);
};
