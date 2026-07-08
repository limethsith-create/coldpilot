// Warmup ramp + daily send limits (pure functions, same policy as the local build).
function daysSince(dateStr) {
  if (!dateStr) return 0;
  const start = new Date(dateStr + 'T00:00:00');
  return Math.floor((Date.now() - start.getTime()) / 86400000) + 1;
}
function warmupTarget(day) {
  if (day <= 0) return 0;
  if (day <= 3) return 3;
  if (day <= 7) return 6;
  if (day <= 14) return 12;
  if (day <= 21) return 20;
  if (day <= 28) return 30;
  return 35;
}
function warmupMaintenance(day) { return day > 42 ? 10 : warmupTarget(day); }
function coldTarget(day, cap) {
  cap = cap || 20;
  if (day < 15) return 0;
  if (day <= 21) return Math.min(5, cap);
  if (day <= 28) return Math.min(10, cap);
  if (day <= 35) return Math.min(15, cap);
  return cap;
}
function inboxPlan(inbox, settings) {
  const day = daysSince(inbox.warmupStartDate);
  const cap = inbox.dailyLimit || (settings.defaultDailyLimit || 20);
  return {
    warmupDay: day,
    warmup: inbox.warmupEnabled === false ? 0 : warmupMaintenance(day),
    cold: coldTarget(day, cap),
    phase: day < 15 ? 'warming' : day < 36 ? 'ramping' : 'full',
  };
}
module.exports = { daysSince, warmupTarget, coldTarget, inboxPlan };
