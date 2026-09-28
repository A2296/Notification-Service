// Exercises the real SMTP provider against small in-process SMTP servers
// (no database or network access needed).
const net = require("node:net");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const createSmtpProvider = require("../src/services/providers/smtpProvider");
const DeliveryError = require("../src/services/providers/deliveryError");

const servers = [];
after(() => servers.forEach((server) => server.close()));

// Minimal SMTP server: accepts every command, answers RCPT with `rcptReply`.
// With `silent`, it accepts the connection but never sends a greeting.
const startSmtpServer = ({ rcptReply = "250 OK", silent = false } = {}) =>
  new Promise((resolve) => {
    const server = net.createServer((socket) => {
      socket.on("error", () => {});
      if (silent) {
        return;
      }

      let inData = false;
      socket.write("220 fake ESMTP\r\n");
      socket.on("data", (chunk) => {
        for (const line of chunk.toString().split("\r\n").filter(Boolean)) {
          if (inData) {
            if (line === ".") {
              inData = false;
              socket.write("250 2.0.0 Ok: queued as FAKE123\r\n");
            }
            continue;
          }

          const command = line.slice(0, 4).toUpperCase();
          if (command === "RCPT") {
            socket.write(`${rcptReply}\r\n`);
          } else if (command === "DATA") {
            inData = true;
            socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
          } else if (command === "QUIT") {
            socket.end("221 Bye\r\n");
          } else {
            socket.write("250 OK\r\n");
          }
        }
      });
    });

    servers.push(server);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });

const providerFor = (port, timeoutMs = 10000) =>
  createSmtpProvider({
    from: "no-reply@example.com",
    smtp: { host: "127.0.0.1", port, secure: false, timeoutMs },
  });

const notification = {
  to: "user@example.com",
  subject: "Hello",
  message: "Test message",
};

test("an accepted email is reported as SENT with the provider message id", async () => {
  const provider = providerFor(await startSmtpServer());

  const result = await provider.send(notification, { name: "Acme" });

  assert.equal(result.status, "SENT");
  assert.ok(result.providerMessageId);
});

test("a 5xx rejection (e.g. unknown mailbox) is a permanent failure", async () => {
  const provider = providerFor(await startSmtpServer({ rcptReply: "550 5.1.1 No such user" }));

  await assert.rejects(provider.send(notification, null), (error) => {
    assert.ok(error instanceof DeliveryError);
    assert.equal(error.permanent, true);
    return true;
  });
});

test("a 4xx rejection (e.g. mailbox busy) is retried later", async () => {
  const provider = providerFor(await startSmtpServer({ rcptReply: "451 4.3.0 Try again later" }));

  await assert.rejects(provider.send(notification, null), (error) => {
    assert.equal(error.permanent, false);
    return true;
  });
});

test("an unresponsive mail server fails fast instead of stalling the queue", async () => {
  const provider = providerFor(await startSmtpServer({ silent: true }), 300);
  const started = Date.now();

  await assert.rejects(provider.send(notification, null), (error) => {
    assert.equal(error.permanent, false);
    return true;
  });
  assert.ok(Date.now() - started < 3000, "should give up after the configured timeout");
});
