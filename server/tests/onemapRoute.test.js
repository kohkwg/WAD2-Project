import { test } from "vitest";

const assert = require("node:assert/strict");

const express = require("express");

const {
  createOneMapRouting,
  parsePoint,
  singaporeParts
} = require("../services/onemapRoute");

const {
  createRouteRouter
} = require("../routes/route");

const env = {
  ONEMAP_EMAIL: "placeholder@example.com",
  ONEMAP_PASSWORD: "placeholder"
};

const json = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body
});

function fakeOneMap({
  ptSeconds = 1500,
  failRoute = false
} = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({
      url,
      options
    });
    if (url.includes("getToken")) return json({
      access_token: "tok",
      expiry_timestamp: String(Math.floor(Date.now() / 1000) + 3 * 86400)
    });
    if (failRoute) return json({}, 500);
    if (url.includes("routeType=walk")) return json({
      route_summary: {
        total_time: 600
      }
    });
    return json({
      plan: {
        itineraries: [{
          duration: ptSeconds,
          transfers: 1,
          walkTime: 300
        }]
      }
    });
  };
  return {
    calls,
    fetchImpl
  };
}
test("points must be Singapore lat,lng", () => {
  assert.deepEqual(parsePoint("1.30,103.85"), {
    lat: 1.3,
    lng: 103.85
  });
  assert.equal(parsePoint("51.5,-0.1"), null);
  assert.equal(parsePoint("1.3;103.8"), null);
  assert.deepEqual(singaporeParts(Date.parse("2026-11-07T10:05:00Z")), {
    date: "11-07-2026",
    time: "18:05:00"
  });
});
test("routes use one token, Singapore date/time and the cache", async () => {
  const fake = fakeOneMap();
  const routing = createOneMapRouting({
    fetchImpl: fake.fetchImpl,
    env
  });
  const args = {
    from: {
      lat: 1.3,
      lng: 103.85
    },
    to: {
      lat: 1.35,
      lng: 103.94
    },
    mode: "pt",
    departMs: Date.parse("2026-11-07T10:05:00Z")
  };
  const first = await routing.route(args);
  assert.deepEqual({
    ...first
  }, {
    minutes: 25,
    mode: "transit",
    transfers: 1,
    walkMinutes: 5,
    live: true,
    cached: false
  });
  const routeCall = fake.calls.find(c => c.url.includes("routingsvc"));
  assert.match(routeCall.url, /date=11-07-2026/);
  assert.match(routeCall.url, /time=18%3A05%3A00/);
  assert.equal(routeCall.options.headers.Authorization, "tok");
  const second = await routing.route({
    ...args,
    departMs: args.departMs + 60 * 1000
  });
  assert.equal(second.cached, true);
  await routing.route({
    ...args,
    mode: "walk"
  });
  assert.equal(fake.calls.filter(c => c.url.includes("getToken")).length, 1);
});
test("unconfigured or failing OneMap is reported, never invented", async () => {
  const unconfigured = createOneMapRouting({
    fetchImpl: async () => {
      throw new Error("should not call");
    },
    env: {}
  });
  await assert.rejects(unconfigured.route({
    from: {
      lat: 1.3,
      lng: 103.85
    },
    to: {
      lat: 1.3,
      lng: 103.86
    },
    mode: "walk",
    departMs: Date.now()
  }), {
    code: "configuration"
  });
  const failing = createOneMapRouting({
    fetchImpl: fakeOneMap({
      failRoute: true
    }).fetchImpl,
    env
  });
  await assert.rejects(failing.route({
    from: {
      lat: 1.3,
      lng: 103.85
    },
    to: {
      lat: 1.3,
      lng: 103.86
    },
    mode: "pt",
    departMs: Date.now()
  }), {
    code: "unavailable"
  });
});

async function call(router, query) {
  const app = express();
  app.use("/api/route", router);
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/route?${new URLSearchParams(query)}`);
    return {
      status: response.status,
      body: await response.json()
    };
  } finally {
    server.close();
  }
}
test("the endpoint validates input, maps errors to 503 and rate limits", async () => {
  const ok = createRouteRouter({
    routing: {
      route: async () => ({
        minutes: 20,
        mode: "transit",
        live: true,
        cached: false
      })
    }
  });
  assert.equal((await call(ok, {
    from: "1.3,103.85",
    to: "1.35,103.94",
    mode: "pt"
  })).status, 200);
  assert.equal((await call(ok, {
    from: "51.5,-0.1",
    to: "1.35,103.94"
  })).status, 400);
  assert.equal((await call(ok, {
    from: "1.3,103.85",
    to: "1.35,103.94",
    mode: "car"
  })).status, 400);
  assert.equal((await call(ok, {
    from: "1.3,103.85",
    to: "1.35,103.94",
    depart: "2030-01-01T00:00:00Z"
  })).status, 400);
  const down = createRouteRouter({
    routing: {
      route: async () => {
        const e = new Error("x");
        e.code = "configuration";
        throw e;
      }
    }
  });
  const result = await call(down, {
    from: "1.3,103.85",
    to: "1.35,103.94"
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.error, "configuration");
  let t = 0;
  const limited = createRouteRouter({
    routing: {
      route: async () => ({
        minutes: 1
      })
    },
    now: () => t
  });
  const app = express();
  app.use("/api/route", limited);
  const server = app.listen(0);
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/route?from=1.3,103.85&to=1.35,103.94`;
    let last;
    for (let i = 0; i < 121; i++) last = await fetch(url);
    assert.equal(last.status, 429);
    t = 61 * 1000;
    assert.equal((await fetch(url)).status, 200);
  } finally {
    server.close();
  }
});
