const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { app, request, connect, disconnect, createBusiness } = require("./helpers");
const Schedule = require("../src/models/scheduleSchema");
const Business = require("../src/models/businessSchema");
const Notification = require("../src/models/notificationSchema");
const scheduleService = require("../src/services/scheduleService");
const { nextRunAfter } = require("../src/utils/recurrence");

let acme;
let globex;

before(async () => {
  await connect(__filename);
  acme = await createBusiness("Acme");
  globex = await createBusiness("Globex");
});

after(disconnect);

const api = (business) => ({
  create: (body) => request(app).post("/api/v1/schedules").set(business.apiHeaders).send(body),
  list: () => request(app).get("/api/v1/schedules").set(business.apiHeaders),
  get: (id) => request(app).get(`/api/v1/schedules/${id}`).set(business.apiHeaders),
  update: (id, body) =>
    request(app).patch(`/api/v1/schedules/${id}`).set(business.apiHeaders).send(body),
  remove: (id) => request(app).delete(`/api/v1/schedules/${id}`).set(business.apiHeaders),
  run: (id) => request(app).post(`/api/v1/schedules/${id}/run`).set(business.apiHeaders),
});

const weeklyDigest = (overrides = {}) => ({
  name: "Weekly digest",
  channel: "EMAIL",
  subject: "Your week",
  message: "Here is what happened this week.",
  recipients: [{ email: "ada@example.com" }, { id: "user_2", email: "grace@example.com" }],
  repeat: { frequency: "WEEKLY", daysOfWeek: [1], time: "09:00", timezone: "Africa/Lagos" },
  ...overrides,
});

// Pretend the schedule became due a minute ago
const makeDue = (id, dueAt = new Date(Date.now() - 60 * 1000)) =>
  Schedule.updateOne({ _id: id }, { nextRunAt: dueAt });

const sentFor = (id) => Notification.countDocuments({ "metadata.scheduleId": String(id) });

test("schedules validate the repeat rule and every recipient", async () => {
  const fieldsOf = (res) => res.body.errors.map((error) => error.field);

  const noDays = await api(acme).create(weeklyDigest({ repeat: { frequency: "WEEKLY", time: "09:00" } }));
  assert.equal(noDays.status, 400);
  assert.ok(fieldsOf(noDays).includes("repeat.daysOfWeek"));

  const badTime = await api(acme).create(
    weeklyDigest({ repeat: { frequency: "DAILY", time: "9am", timezone: "Nowhere/City" } })
  );
  assert.ok(fieldsOf(badTime).includes("repeat.time"));
  assert.ok(fieldsOf(badTime).includes("repeat.timezone"));

  const badRecipient = await api(acme).create(
    weeklyDigest({ recipients: [{ email: "ok@example.com" }, { email: "not-an-email" }] })
  );
  assert.deepEqual(fieldsOf(badRecipient), ["recipients.1.email"]);

  // A problem with the shared message is reported once, not once per recipient
  const noSubject = await api(acme).create(weeklyDigest({ subject: undefined }));
  assert.deepEqual(fieldsOf(noSubject), ["subject"]);
});

test("a new schedule's first run is calculated in its own timezone", async () => {
  const res = await api(acme).create(weeklyDigest());

  assert.equal(res.status, 201);
  const { schedule } = res.body;
  assert.equal(schedule.status, "ACTIVE");
  assert.equal(schedule.repeat.timezone, "Africa/Lagos");
  assert.deepEqual(schedule.repeat.daysOfWeek, [1]);
  assert.equal(schedule.business, undefined);

  const nextRun = new Date(schedule.nextRunAt);
  assert.ok(nextRun > new Date());
  assert.equal(nextRun.getUTCDay(), 1); // Monday 09:00 in Lagos is Monday 08:00 UTC
  assert.equal(nextRun.getUTCHours(), 8);

  await api(acme).remove(schedule.id);
});

test("a due schedule sends to every recipient and moves to its next run", async () => {
  const { schedule } = (await api(acme).create(weeklyDigest())).body;
  await makeDue(schedule.id);

  const processed = await scheduleService.runDueSchedules();
  assert.equal(processed, 1);

  assert.equal(await sentFor(schedule.id), 2);
  const notification = await Notification.findOne({ "metadata.scheduleId": schedule.id });
  assert.equal(notification.subject, "Your week");
  assert.equal(notification.metadata.scheduleName, "Weekly digest");

  const stored = await Schedule.findById(schedule.id);
  assert.equal(stored.runCount, 1);
  assert.equal(stored.lastRun.accepted, 2);
  assert.ok(stored.nextRunAt > new Date());
  assert.equal(stored.lockedAt, null);

  // Nothing is due any more
  assert.equal(await scheduleService.runDueSchedules(), 0);
  await api(acme).remove(schedule.id);
});

test("a run repeated after a crash does not send twice", async () => {
  const { schedule } = (await api(acme).create(weeklyDigest())).body;
  const dueAt = new Date(Date.now() - 60 * 1000);

  await makeDue(schedule.id, dueAt);
  await scheduleService.runDueSchedules();

  // Simulate a worker that created the notifications, then crashed before saving the schedule
  await Schedule.updateOne({ _id: schedule.id }, { nextRunAt: dueAt, lockedAt: null });
  await scheduleService.runDueSchedules();

  assert.equal(await sentFor(schedule.id), 2);
  await api(acme).remove(schedule.id);
});

test("after downtime a schedule runs once, not once per missed run", async () => {
  const { schedule } = (
    await api(acme).create(
      weeklyDigest({ repeat: { frequency: "DAILY", time: "07:00", timezone: "UTC" } })
    )
  ).body;
  await makeDue(schedule.id, new Date(Date.now() - 5 * 24 * 60 * 60 * 1000));

  assert.equal(await scheduleService.runDueSchedules(), 1);
  assert.equal(await scheduleService.runDueSchedules(), 0);
  assert.equal(await sentFor(schedule.id), 2);
  await api(acme).remove(schedule.id);
});

test("paused schedules do not run; resuming picks the next future time", async () => {
  const { schedule } = (await api(acme).create(weeklyDigest())).body;

  const paused = await api(acme).update(schedule.id, { status: "PAUSED" });
  assert.equal(paused.status, 200);
  assert.equal(paused.body.schedule.nextRunAt, null);

  await makeDue(schedule.id);
  await Schedule.updateOne({ _id: schedule.id }, { status: "PAUSED" });
  assert.equal(await scheduleService.runDueSchedules(), 0);

  const resumed = await api(acme).update(schedule.id, { status: "ACTIVE" });
  assert.ok(new Date(resumed.body.schedule.nextRunAt) > new Date());
  await api(acme).remove(schedule.id);
});

test("updates change only what is sent and are validated as a whole", async () => {
  const { schedule } = (await api(acme).create(weeklyDigest())).body;

  const newTime = await api(acme).update(schedule.id, { repeat: { time: "10:30" } });
  assert.equal(newTime.status, 200);
  assert.equal(newTime.body.schedule.repeat.time, "10:30");
  assert.equal(newTime.body.schedule.repeat.frequency, "WEEKLY");
  assert.equal(newTime.body.schedule.name, "Weekly digest");
  assert.equal(
    newTime.body.schedule.nextRunAt,
    nextRunAfter(newTime.body.schedule.repeat, new Date()).toISOString()
  );

  const toMonthly = await api(acme).update(schedule.id, { repeat: { frequency: "MONTHLY" } });
  assert.equal(toMonthly.status, 400);
  assert.equal(toMonthly.body.errors[0].field, "repeat.dayOfMonth");

  const toSms = await api(acme).update(schedule.id, { channel: "SMS" });
  assert.equal(toSms.status, 400); // the recipients have no phone numbers
  await api(acme).remove(schedule.id);
});

test("run now sends immediately and keeps the timetable", async () => {
  const { schedule } = (await api(acme).create(weeklyDigest())).body;

  const res = await api(acme).run(schedule.id);

  assert.equal(res.status, 202);
  assert.equal(res.body.accepted, 2);
  assert.equal(res.body.schedule.nextRunAt, schedule.nextRunAt);
  assert.equal(res.body.schedule.lastRun.manual, true);
  assert.equal(await sentFor(schedule.id), 2);
  await api(acme).remove(schedule.id);
});

test("schedules are private to their business", async () => {
  const { schedule } = (await api(acme).create(weeklyDigest())).body;

  assert.equal((await api(globex).get(schedule.id)).status, 404);
  assert.equal((await api(globex).update(schedule.id, { status: "PAUSED" })).status, 404);
  assert.equal((await api(globex).run(schedule.id)).status, 404);
  assert.equal((await api(globex).remove(schedule.id)).status, 404);
  assert.equal((await api(globex).list()).body.schedules.length, 0);

  assert.equal((await api(acme).list()).body.schedules.length, 1);
  assert.equal((await api(acme).remove(schedule.id)).status, 200);
  assert.equal((await api(acme).get(schedule.id)).status, 404);
});

test("a suspended business's schedules are skipped but keep their timetable", async () => {
  const { schedule } = (await api(acme).create(weeklyDigest())).body;
  await makeDue(schedule.id);
  await Business.updateOne({ _id: acme.businessId }, { status: "SUSPENDED" });

  try {
    assert.equal(await scheduleService.runDueSchedules(), 1);
    assert.equal(await sentFor(schedule.id), 0);

    const stored = await Schedule.findById(schedule.id);
    assert.match(stored.lastRun.skipped, /suspended/);
    assert.ok(stored.nextRunAt > new Date());
  } finally {
    await Business.updateOne({ _id: acme.businessId }, { status: "ACTIVE" });
  }
  await api(acme).remove(schedule.id);
});

test("a business can have at most 20 schedules", async () => {
  for (let count = 1; count <= 20; count += 1) {
    assert.equal((await api(globex).create(weeklyDigest({ name: `Schedule ${count}` }))).status, 201);
  }

  const blocked = await api(globex).create(weeklyDigest({ name: "One too many" }));
  assert.equal(blocked.status, 409);
});

test("dashboard users manage schedules with their session", async () => {
  const res = await request(app)
    .post("/api/v1/schedules")
    .set(acme.jwtHeaders)
    .send(weeklyDigest({ status: "PAUSED" }));

  assert.equal(res.status, 201);
  assert.equal(res.body.schedule.nextRunAt, null);
});
