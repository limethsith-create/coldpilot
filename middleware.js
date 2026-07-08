// Vercel Edge Middleware: HTTP Basic auth for the dashboard + data/action APIs.
// Public (never gated): tracking pixels, click redirects, unsubscribe, cron tick.
export const config = { matcher: ['/', '/index.html', '/api/stats', '/api/dns', '/api/verify'] };
export default function middleware(req) {
  const pass = process.env.DASHBOARD_PASSWORD || 'coldpilot-7431';
  const expected = 'Basic ' + btoa('admin:' + pass);
  if (req.headers.get('authorization') === expected) return;
  return new Response('Authentication required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="ColdPilot"' } });
}
