// Vercel Edge Middleware: HTTP Basic auth for the dashboard + data APIs.
// Public (never gated): tracking pixels, click redirects, unsubscribe, cron tick.
export const config = { matcher: ['/', '/index.html', '/api/stats', '/api/dns'] };

export default function middleware(req) {
  const user = 'admin';
  const pass = process.env.DASHBOARD_PASSWORD || 'coldpilot-7431';
  const expected = 'Basic ' + btoa(user + ':' + pass);
  const got = req.headers.get('authorization');
  if (got === expected) return; // allow
  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="ColdPilot"' },
  });
}
