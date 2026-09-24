const Notification = require("../models/notificationSchema");
const Business = require("../models/businessSchema");
const config = require("../config");
const { getProvider } = require("./providers");

// MongoDB-backed delivery queue.
// The API stores notifications as PENDING and returns immediately; this worker
// claims them one at a time (atomically, so several API instances can run it
// safely), sends them through the channel's provider, and retries failures
// with exponential backoff (30s, 2m, 8m, ...).

const RETRY_BASE_MS = 30 * 1000;

const backoffMs = (attempts) => RETRY_BASE_MS * 4 ** (attempts - 1);

const claimNext = () => {
  const now = new Date();
  const staleLock = new Date(now.getTime() - config.worker.lockTimeoutMs);

  return Notification.findOneAndUpdate(
    {
      $or: [
        { status: "PENDING", nextAttemptAt: { $lte: now } },
        // A worker crashed mid-send; make the notification available again
        { status: "PROCESSING", lockedAt: { $lte: staleLock } },
      ],
    },
    {
      $set: { status: "PROCESSING", lockedAt: now },
      $inc: { attempts: 1 },
    },
    { sort: { nextAttemptAt: 1 }, returnDocument: "after" }
  );
};

const deliver = async (notification) => {
  try {
    const provider = getProvider(notification.channel);
    const business = await Business.findById(notification.business);
    const result = await provider.send(notification, business);

    notification.provider = provider.name;
    notification.providerMessageId = result.providerMessageId || null;
    notification.sentAt = new Date();
    notification.failureReason = null;

    if (result.status === "DELIVERED") {
      notification.deliveredAt = notification.sentAt;
    }

    notification.addEvent(result.status, `Accepted by ${provider.name}`);
  } catch (error) {
    notification.failureReason = error.message;

    const canRetry =
      !error.permanent && notification.attempts < notification.maxAttempts;

    if (canRetry) {
      notification.nextAttemptAt = new Date(
        Date.now() + backoffMs(notification.attempts)
      );
      notification.addEvent(
        "PENDING",
        `Attempt ${notification.attempts} failed, will retry: ${error.message}`
      );
    } else {
      notification.failedAt = new Date();
      notification.addEvent("FAILED", error.message);
    }
  }

  notification.lockedAt = null;
  await notification.save();

  return notification;
};

// Process everything that is due right now. Returns how many were processed.
const processPending = async (max = 100) => {
  let processed = 0;

  while (processed < max) {
    const notification = await claimNext();

    if (!notification) {
      break;
    }

    await deliver(notification);
    processed += 1;
  }

  return processed;
};

let timer = null;
let running = false;

const tick = async () => {
  if (running) {
    return;
  }

  running = true;
  try {
    await processPending();
  } catch (error) {
    console.error(`Delivery worker error: ${error.message}`);
  } finally {
    running = false;
  }
};

const start = () => {
  if (!timer) {
    timer = setInterval(tick, config.worker.pollIntervalMs);
    console.log("Delivery worker started");
  }
};

const stop = async () => {
  clearInterval(timer);
  timer = null;

  // Let an in-flight batch finish before the process exits
  while (running) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

module.exports = {
  processPending,
  start,
  stop,
};
