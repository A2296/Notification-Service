// When does a daily / weekly / monthly schedule run next?
// Times are wall-clock times in the schedule's own timezone, so "09:00 America/New_York"
// stays 09:00 local time across daylight-saving changes. Offsets come from Intl, so no
// timezone library is needed.

const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"];

const isValidTimeZone = (timeZone) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
};

const formatters = new Map();

// { year, month (1-12), day, hour, minute, second } as shown on a clock in timeZone
const wallClock = (instant, timeZone) => {
  if (!formatters.has(timeZone)) {
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
      })
    );
  }

  return Object.fromEntries(
    formatters
      .get(timeZone)
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
};

// How far timeZone is ahead of UTC at a given instant, in milliseconds
const offsetAt = (instant, timeZone) => {
  const clock = wallClock(instant, timeZone);
  const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
};

// The instant at which a clock in timeZone shows the given local date and time
const zonedTime = (year, monthIndex, day, hour, minute, timeZone) => {
  const wall = Date.UTC(year, monthIndex, day, hour, minute);
  const guess = wall - offsetAt(new Date(wall), timeZone);
  // Use the offset in force at the result, in case a DST change lies in between
  return new Date(wall - offsetAt(new Date(guess), timeZone));
};

// `day` is a UTC-midnight Date standing for a local calendar day
const runsOn = (repeat, day) => {
  if (repeat.frequency === "WEEKLY") {
    return repeat.daysOfWeek.includes(day.getUTCDay());
  }

  if (repeat.frequency === "MONTHLY") {
    // Day 29-31 in a shorter month runs on that month's last day
    const lastDay = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
    return day.getUTCDate() === Math.min(repeat.dayOfMonth, lastDay);
  }

  return true;
};

// First run strictly after `after`
const nextRunAfter = (repeat, after = new Date()) => {
  const [hour, minute] = repeat.time.split(":").map(Number);
  const timeZone = repeat.timezone || "UTC";
  const today = wallClock(after, timeZone);

  // Every rule matches at least once in any 31 consecutive days
  for (let offset = 0; offset <= 62; offset += 1) {
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));

    if (runsOn(repeat, day)) {
      const run = zonedTime(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute, timeZone);
      if (run > after) {
        return run;
      }
    }
  }

  throw new Error(`No upcoming run for schedule rule ${JSON.stringify(repeat)}`);
};

module.exports = {
  FREQUENCIES,
  isValidTimeZone,
  nextRunAfter,
};
