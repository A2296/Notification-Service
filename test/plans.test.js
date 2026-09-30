// Runs in its own process so these small monthly limits do not affect other tests
process.env.PLAN_FREE_MONTHLY_LIMIT = "3";
process.env.PLAN_STARTER_MONTHLY_LIMIT = "5";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  app,
  request,
  connect,
  disconnect,
  createBusiness,
  createAdmin,
} = require("./helpers");
const Notification = require("../src/models/notificationSchema");
const Schedule = require("../src/models/scheduleSchema");
const scheduleService = require("../src/services/scheduleService");

let admin;

before(async () => {
  await connect(__filename);
  admin = await createAdmin();
});

after(disconnect);

const usageOf = async (business) => {
  const res = await request(app).get("/api/v1/notifications/usage").set(business.apiHeaders);
  assert.equal(res.status, 200);
  return res.body.usage;
};

const sendEmail = (business, key) => {
  const req = request(app).post("/api/v1/notifications").set(business.apiHeaders);
  if (key) {
    req.set("Idempotency-Key", key);
  }
  return req.send({
    channel: "EMAIL",
    recipient: { email: "ada@example.com" },
    subject: "Hello",
    message: "Hi there",
  });
};

const setPlan = (business, body) =>
  request(app).patch(`/api/v1/admin/businesses/${business.businessId}`).set(admin).send(body);

test("plans are public and every business starts on Free", async () => {
  const plans = await request(app).get("/api/v1/plans");
  assert.equal(plans.status, 200);
  assert.deepEqual(
    plans.body.plans.map((plan) => [plan.id, plan.monthlyNotifications]),
    [["FREE", 3], ["STARTER", 5], ["PRO", 100000]]
  );

  const biz = await createBusiness("Newcomer");
  const usage = await usageOf(biz);
  const now = new Date();

  assert.equal(usage.plan.id, "FREE");
  assert.equal(usage.limit, 3);
  assert.equal(usage.used, 0);
  assert.equal(usage.remaining, 3);
  assert.equal(
    usage.resetsAt,
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
  );

  // Dashboard sessions see the same usage as API keys
  const viaJwt = await request(app).get("/api/v1/notifications/usage").set(biz.jwtHeaders);
  assert.equal(viaJwt.body.usage.remaining, 3);
});

test("the monthly limit stops new notifications, but repeated requests still get the original", async () => {
  const biz = await createBusiness("Busy");

  for (const key of ["k1", "k2", "k3"]) {
    assert.equal((await sendEmail(biz, key)).status, 202);
  }

  const over = await sendEmail(biz, "k4");
  assert.equal(over.status, 429);
  assert.equal(over.body.code, "MONTHLY_LIMIT_REACHED");
  assert.match(over.body.message, /Monthly notification limit reached: the Free plan includes 3/);

  const repeat = await sendEmail(biz, "k1");
  assert.equal(repeat.status, 200);
  assert.ok(repeat.body.notification.id);

  const usage = await usageOf(biz);
  assert.equal(usage.used, 3);
  assert.equal(usage.remaining, 0);

  // Only this business is affected
  const other = await createBusiness("Quiet");
  assert.equal((await sendEmail(other)).status, 202);
});

test("only this calendar month counts", async () => {
  const biz = await createBusiness("Last month");
  const res = await sendEmail(biz);
  assert.equal(res.status, 202);

  const now = new Date();
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
  await Notification.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(res.body.notification.id) },
    { $set: { createdAt: lastMonth } }
  );

  assert.equal((await usageOf(biz)).used, 0);
});

test("a bulk send is accepted up to the limit and reports the rest", async () => {
  const biz = await createBusiness("Bulk sender");
  const res = await request(app)
    .post("/api/v1/notifications/bulk")
    .set(biz.apiHeaders)
    .send({
      channel: "EMAIL",
      subject: "News",
      message: "Hello",
      notifications: [1, 2, 3, 4, 5].map((n) => ({ recipient: { email: `u${n}@example.com` } })),
    });

  assert.equal(res.status, 202);
  assert.equal(res.body.accepted, 3);
  assert.equal(res.body.failed, 2);
  assert.match(res.body.results[4].error, /Monthly notification limit reached/);
  assert.equal(await Notification.countDocuments({ business: biz.businessId }), 3);
});

test("a platform admin changes a business's plan and the new limit applies at once", async () => {
  const biz = await createBusiness("Upgrader");
  for (let count = 0; count < 3; count += 1) {
    await sendEmail(biz);
  }
  assert.equal((await sendEmail(biz)).status, 429);

  assert.equal((await setPlan(biz, { plan: "GOLD" })).status, 400);
  assert.equal((await setPlan(biz, {})).status, 400);

  const upgraded = await setPlan(biz, { plan: "STARTER" });
  assert.equal(upgraded.status, 200);
  assert.equal(upgraded.body.business.plan, "STARTER");
  assert.equal(upgraded.body.business.status, "ACTIVE");

  assert.equal((await sendEmail(biz)).status, 202);
  const usage = await usageOf(biz);
  assert.equal(usage.plan.name, "Starter");
  assert.deepEqual([usage.used, usage.limit, usage.remaining], [4, 5, 1]);

  const starters = await request(app).get("/api/v1/admin/businesses?plan=STARTER").set(admin);
  assert.deepEqual(
    starters.body.businesses.map((business) => business.id),
    [biz.businessId]
  );

  const stats = await request(app).get(`/api/v1/admin/businesses/${biz.businessId}/stats`).set(admin);
  assert.equal(stats.body.usage.used, 4);

  // Businesses cannot change their own plan
  const self = await request(app)
    .patch(`/api/v1/admin/businesses/${biz.businessId}`)
    .set(biz.jwtHeaders)
    .send({ plan: "PRO" });
  assert.equal(self.status, 403);
});

test("schedules stop at the limit: run now explains it, and due runs are skipped", async () => {
  const biz = await createBusiness("Scheduler");
  const created = await request(app)
    .post("/api/v1/schedules")
    .set(biz.apiHeaders)
    .send({
      name: "Digest",
      channel: "EMAIL",
      subject: "Your week",
      message: "Here is your week.",
      recipients: [{ email: "ada@example.com" }, { email: "grace@example.com" }],
      repeat: { frequency: "DAILY", time: "09:00", timezone: "Africa/Lagos" },
    });
  assert.equal(created.status, 201);
  const { id } = created.body.schedule;
  const runNow = () => request(app).post(`/api/v1/schedules/${id}/run`).set(biz.apiHeaders);

  assert.equal((await runNow()).body.accepted, 2);

  // One left: the run is partial and says why
  const partial = await runNow();
  assert.equal(partial.status, 202);
  assert.deepEqual([partial.body.accepted, partial.body.failed], [1, 1]);
  assert.match(partial.body.message, /Monthly notification limit reached/);
  assert.match(partial.body.schedule.lastRun.reason, /Monthly notification limit reached/);

  const none = await runNow();
  assert.equal(none.status, 429);
  assert.equal(none.body.code, "MONTHLY_LIMIT_REACHED");

  await Schedule.updateOne({ _id: id }, { nextRunAt: new Date(Date.now() - 60 * 1000) });
  assert.equal(await scheduleService.runDueSchedules(), 1);

  const stored = await Schedule.findById(id);
  assert.match(stored.lastRun.skipped, /Monthly notification limit reached/);
  assert.ok(stored.nextRunAt > new Date());
  assert.equal(await Notification.countDocuments({ business: biz.businessId }), 3);
});
