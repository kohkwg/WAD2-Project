const test = require("node:test");

const assert = require("node:assert/strict");

const express = require("express");

const {
  createHangoutsRouter
} = require("../routes/hangouts");

const EVENT = "30000000-0000-4000-8000-000000000001";

const HOST = "host-id",
  BOB = "bob-id";

const sg = (d, t) => new Date(`${d}T${t}:00+08:00`).toISOString();

const rows = {
  hangout: {
    date_start: "2026-11-07",
    date_end: "2026-11-08",
    locked_start: null,
    locked_end: null,
    stage: "collecting"
  },
  organiserId: HOST,
  members: [{
    user_id: HOST,
    display_name: "Hana"
  }, {
    user_id: BOB,
    display_name: "Bob"
  }],
  settings: [],
  replies: [{
    user_id: HOST
  }, {
    user_id: BOB
  }],
  blocks: [{
    user_id: HOST,
    starts_at: sg("2026-11-07", "12:00"),
    ends_at: sg("2026-11-07", "20:00")
  }, {
    user_id: BOB,
    starts_at: sg("2026-11-07", "14:00"),
    ends_at: sg("2026-11-07", "19:00")
  }]
};

async function call(options, {
  method = "GET",
  path,
  body,
  user = BOB
}) {
  const app = express();
  app.use(express.json());
  const auth = (req, res, next) => {
    if (!user) return res.status(401).json({
      error: "Missing token"
    });
    req.user = {
      id: user
    };
    req.accessToken = "t";
    next();
  };
  app.use("/api/hangouts", createHangoutsRouter({
    auth,
    adminClient: () => ({}),
    readRows: async () => rows,
    ...options
  }));
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/hangouts${path}`, {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      body: body && JSON.stringify(body)
    });
    return {
      status: response.status,
      body: await response.json()
    };
  } finally {
    server.close();
  }
}

const member = isMember => ({
  userClient: () => ({
    rpc: async () => ({
      data: isMember,
      error: null
    })
  })
});
test("members get ranked times and aggregate counts but never others' raw free times", async () => {
  const {
    status,
    body
  } = await call(member(true), {
    path: `/${EVENT}/time`
  });
  assert.equal(status, 200);
  assert.equal(body.isHost, false);
  assert.equal(body.myIntervals.length, 1);
  assert.equal(body.myIntervals[0].start, Date.parse(sg("2026-11-07", "14:00")));
  assert.ok(body.members.every(m => !("intervals" in m)));
  assert.ok(body.options.length >= 1 && body.options.every(o => o.available.every(m => !("intervals" in m))));
  assert.deepEqual(body.options[0].available.map(m => m.name).sort(), ["Bob", "Hana"]);
  assert.deepEqual(body.rescue, []);
  assert.ok(JSON.stringify(body).indexOf(sg("2026-11-07", "12:00")) === -1);
});
test("non-members, bad ids, missing sign-in and missing setup are refused", async () => {
  assert.equal((await call(member(false), {
    path: `/${EVENT}/time`
  })).status, 403);
  assert.equal((await call(member(true), {
    path: "/not-a-uuid/time"
  })).status, 400);
  assert.equal((await call(member(true), {
    path: `/${EVENT}/time`,
    user: null
  })).status, 401);
  const missing = await call({
    userClient: () => ({
      rpc: async () => ({
        data: null,
        error: {
          code: "PGRST202"
        }
      })
    })
  }, {
    path: `/${EVENT}/time`
  });
  assert.equal(missing.status, 503);
});
test("custom slot preview blocks on required members", async () => {
  const {
    status,
    body
  } = await call(member(true), {
    method: "POST",
    path: `/${EVENT}/preview-slot`,
    body: {
      start: Date.parse(sg("2026-11-07", "12:00")),
      end: Date.parse(sg("2026-11-07", "15:00"))
    }
  });
  assert.equal(status, 200);
  assert.equal(body.ok, true); // bob isn't required; the host is free
  assert.deepEqual(body.cannot.map(m => m.name), ["Bob"]);
  assert.equal((await call(member(true), {
    method: "POST",
    path: `/${EVENT}/preview-slot`,
    body: {
      start: 5,
      end: 1
    }
  })).status, 400);
});
