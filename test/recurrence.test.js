const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nextRunAfter, isValidTimeZone } = require("../src/utils/recurrence");

const at = (iso) => new Date(iso);
const next = (repeat, after) => nextRunAfter(repeat, at(after)).toISOString();

test("daily runs later today, or tomorrow once the time has passed", () => {
  const daily = { frequency: "DAILY", time: "09:00", timezone: "UTC" };

  assert.equal(next(daily, "2026-03-10T08:59:00Z"), "2026-03-10T09:00:00.000Z");
  assert.equal(next(daily, "2026-03-10T09:00:00Z"), "2026-03-11T09:00:00.000Z");
});

test("times are local to the schedule's timezone", () => {
  // Lagos is UTC+1 all year
  const lagos = { frequency: "DAILY", time: "09:00", timezone: "Africa/Lagos" };
  assert.equal(next(lagos, "2026-03-10T07:00:00Z"), "2026-03-10T08:00:00.000Z");

  // Just after midnight in Lagos is still the previous evening in UTC
  const lateLagos = { frequency: "DAILY", time: "00:30", timezone: "Africa/Lagos" };
  assert.equal(next(lateLagos, "2026-03-10T22:00:00Z"), "2026-03-10T23:30:00.000Z");
});

test("09:00 stays 09:00 local time across a daylight-saving change", () => {
  const newYork = { frequency: "DAILY", time: "09:00", timezone: "America/New_York" };

  // US clocks move forward on 2026-03-08: EST (UTC-5) before, EDT (UTC-4) after
  assert.equal(next(newYork, "2026-03-07T15:00:00Z"), "2026-03-08T13:00:00.000Z");
  assert.equal(next(newYork, "2026-03-06T15:00:00Z"), "2026-03-07T14:00:00.000Z");
});

test("weekly runs on the chosen days only", () => {
  // 2026-03-10 is a Tuesday; 1 = Monday, 3 = Wednesday
  const weekly = { frequency: "WEEKLY", time: "10:00", daysOfWeek: [1, 3], timezone: "UTC" };

  assert.equal(next(weekly, "2026-03-10T12:00:00Z"), "2026-03-11T10:00:00.000Z");
  assert.equal(next(weekly, "2026-03-11T10:00:00Z"), "2026-03-16T10:00:00.000Z");
});

test("monthly on the 31st runs on the last day of shorter months", () => {
  const monthly = { frequency: "MONTHLY", time: "08:00", dayOfMonth: 31, timezone: "UTC" };

  assert.equal(next(monthly, "2026-01-31T09:00:00Z"), "2026-02-28T08:00:00.000Z");
  assert.equal(next(monthly, "2028-02-01T00:00:00Z"), "2028-02-29T08:00:00.000Z"); // leap year
  assert.equal(next(monthly, "2026-02-28T08:00:00Z"), "2026-03-31T08:00:00.000Z");
});

test("timezone names are validated", () => {
  assert.equal(isValidTimeZone("Africa/Lagos"), true);
  assert.equal(isValidTimeZone("UTC"), true);
  assert.equal(isValidTimeZone("Mars/Olympus_Mons"), false);
});
