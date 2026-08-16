'use strict';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const DOW = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

function assertDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) throw new Error('invalid_now');
}

function parseClock(value) {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) throw new Error('invalid_clock');
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) throw new Error('invalid_clock');
  return { hh, mm };
}

function toBrisbaneParts(date) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Brisbane', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short'
  }).formatToParts(date).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return parts;
}

function brisbaneLocalToUtc(year, month, day, hh, mm) {
  // Australia/Brisbane is UTC+10 and does not observe DST.
  return new Date(Date.UTC(year, month - 1, day, hh - 10, mm, 0, 0));
}

function nextDailyAt(now, hh, mm) {
  const p = toBrisbaneParts(now);
  let y = Number(p.year), mo = Number(p.month), d = Number(p.day);
  let candidate = brisbaneLocalToUtc(y, mo, d, hh, mm);
  if (candidate <= now) {
    const temp = new Date(Date.UTC(y, mo - 1, d) + DAY);
    y = temp.getUTCFullYear(); mo = temp.getUTCMonth() + 1; d = temp.getUTCDate();
    candidate = brisbaneLocalToUtc(y, mo, d, hh, mm);
  }
  return candidate;
}

function nextWeekly(now, allowedDays, hh, mm) {
  const base = toBrisbaneParts(now);
  const y = Number(base.year), mo = Number(base.month), d = Number(base.day);
  for (let offset = 0; offset <= 7; offset++) {
    const temp = new Date(Date.UTC(y, mo - 1, d) + offset * DAY);
    const dow = temp.getUTCDay();
    if (!allowedDays.includes(dow)) continue;
    const candidate = brisbaneLocalToUtc(temp.getUTCFullYear(), temp.getUTCMonth() + 1, temp.getUTCDate(), hh, mm);
    if (candidate > now) return candidate;
  }
  throw new Error('weekly_resolution_failed');
}

function nextDue(cadence, now = new Date()) {
  assertDate(now);
  const raw = String(cadence || '').trim().toUpperCase();
  if (!raw) throw new Error('missing_cadence');
  if (raw === 'HOURLY') return new Date(now.getTime() + HOUR);

  let m = /^EVERY\s+(\d+)\s+HOURS?$/.exec(raw);
  if (m) {
    const n = Number(m[1]);
    if (n < 1 || n > 168) throw new Error('invalid_hour_interval');
    return new Date(now.getTime() + n * HOUR);
  }

  if (raw === 'DAILY') return nextDailyAt(now, 8, 0);
  m = /^DAILY\s+(\d{2}:\d{2})$/.exec(raw);
  if (m) {
    const { hh, mm } = parseClock(m[1]);
    return nextDailyAt(now, hh, mm);
  }

  if (raw === 'WEEKLY') return nextWeekly(now, [1], 8, 0);
  m = /^WEEKLY\s+([A-Z,]+)\s+(\d{2}:\d{2})$/.exec(raw);
  if (m) {
    const allowed = m[1].split(',').map(x => {
      if (!(x in DOW)) throw new Error('invalid_weekday');
      return DOW[x];
    });
    const { hh, mm } = parseClock(m[2]);
    return nextWeekly(now, allowed, hh, mm);
  }

  m = /^ONCE\s+(.+)$/.exec(raw);
  if (m) {
    const once = new Date(m[1]);
    if (Number.isNaN(once.getTime())) throw new Error('invalid_once_timestamp');
    return once;
  }

  throw new Error('unsupported_cadence');
}

module.exports = { nextDue, toBrisbaneParts };
