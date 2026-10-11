import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash } from "node:crypto";
import { createServer } from "node:net";
import { demoBackup } from "../../frontend/tools/demo-data.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const dll = resolve(
  root,
  "backend/src/Bitacora.Api/bin/Debug/net10.0/Bitacora.Api.dll",
);
const password = randomBytes(32).toString("base64url");
let directory, baseUrl, server, first, second;
const credentials = { username: "traveler.one", password };
const fixture = demoBackup();
fixture.customMetadata = { future: true, text: "ñ, lluvia y café" };
fixture.data.trip.customField = { preserved: null };
const entity = {
  tripId: fixture.data.trip.id,
  createdAt: fixture.exportedAt,
  updatedAt: fixture.exportedAt,
};
fixture.data.actualDays = [
  {
    ...entity,
    id: "demo-actual-1",
    date: "2030-06-03",
    cyclingKm: null,
    stageIds: [],
  },
  {
    ...entity,
    id: "demo-actual-2",
    date: "2030-06-04",
    cyclingKm: 0,
    stageIds: [],
  },
];
fixture.data.places = [
  {
    ...entity,
    id: "demo-place",
    name: "Lugar de ejemplo",
    category: "camping",
    latitude: null,
    longitude: null,
    coordinates_status: "sin_verificar",
    notes: "",
    contact: null,
    sourceRef: null,
  },
];
fixture.data.diaryEntries = [
  {
    ...entity,
    id: "demo-note",
    actualDayId: "demo-actual-1",
    text: "Lluvia, café y ñ. <img src=x onerror=alert(1)>",
    stageIds: [],
    placeIds: ["demo-place"],
  },
];
const route = "/api/trips/" + fixture.data.trip.id;
let etag;

function startProcess(args, env) {
  const process = spawn("dotnet", [dll, ...args], {
    cwd: root,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  // Never print process streams: test failures must not disclose cookies or input.
  process.stdout.resume();
  process.stderr.resume();
  process.on("error", () => {});
  return process;
}
async function stopped(process) {
  if (process.exitCode !== null) return;
  await new Promise((done) => {
    process.once("exit", done);
    process.kill();
  });
}
async function freePort() {
  const listener = createServer();
  await new Promise((done) => listener.listen(0, "127.0.0.1", done));
  const port = listener.address().port;
  await new Promise((done) => listener.close(done));
  return port;
}
function environment() {
  return {
    ...process.env,
    ASPNETCORE_ENVIRONMENT: "Development",
    ASPNETCORE_URLS: baseUrl,
    Storage__Directory: directory,
  };
}
async function createAccount(username) {
  const child = startProcess(["create-user"], environment());
  const completion = new Promise((done) => child.once("exit", done));
  child.stdin.end(`${username}\n${password}\n${password}\n`);
  assert.equal(await completion, 0, "Administrative account creation failed.");
}
async function boot(env = environment()) {
  server = startProcess([], env);
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw new Error("API exited before becoming healthy.");
    try {
      if ((await fetch(baseUrl + "/health")).ok) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error("API did not become healthy.");
}
class Client {
  cookies = new Map();
  token = "";
  async request(
    path,
    { method = "GET", body, headers = {}, csrf = true } = {},
  ) {
    const response = await fetch(baseUrl + path, {
      method,
      redirect: "manual",
      headers: {
        Cookie: [...this.cookies]
          .map(([key, value]) => `${key}=${value}`)
          .join("; "),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(csrf && this.token ? { "X-CSRF-TOKEN": this.token } : {}),
        ...headers,
      },
      ...(body !== undefined
        ? { body: typeof body === "string" ? body : JSON.stringify(body) }
        : {}),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      const key = pair.slice(0, index),
        value = pair.slice(index + 1);
      if (value) this.cookies.set(key, value);
      else this.cookies.delete(key);
    }
    return response;
  }
  async csrf() {
    const response = await this.request("/api/auth/csrf");
    assert.equal(response.status, 200);
    this.token = (await response.json()).token;
  }
  async login(username = credentials.username) {
    await this.csrf();
    const response = await this.request("/api/auth/login", {
      method: "POST",
      body: { username, password },
    });
    assert.equal(response.status, 200);
    await this.csrf();
    return response;
  }
}
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "bitacora-api-test-"));
  baseUrl = `http://127.0.0.1:${await freePort()}`;
  await createAccount("traveler.one");
  await createAccount("traveler.two");
  await boot();
  first = new Client();
  second = new Client();
});
after(async () => {
  if (server) await stopped(server);
  // This exact private directory was created by mkdtemp; never remove a configured DB.
  if (directory && directory.startsWith(join(tmpdir(), "bitacora-api-test-")))
    await rm(directory, { recursive: true, force: true });
});

test("private endpoints deny anonymous access without redirecting", async () => {
  assert.equal((await first.request("/api/trips")).status, 401);
  assert.equal((await first.request("/api/auth/me")).status, 401);
  assert.equal((await first.request(route)).status, 401);
});
test("login needs CSRF, denies incorrect credentials and issues a private session", async () => {
  assert.equal(
    (
      await first.request("/api/auth/login", {
        method: "POST",
        body: credentials,
        csrf: false,
      })
    ).status,
    403,
  );
  await first.csrf();
  const anonymousToken = first.token;
  assert.equal(
    (
      await first.request("/api/auth/login", {
        method: "POST",
        body: { ...credentials, password: randomBytes(24).toString("hex") },
      })
    ).status,
    401,
  );
  const response = await first.login();
  assert.equal(
    (
      await first.request("/api/auth/logout", {
        method: "POST",
        headers: { "X-CSRF-TOKEN": anonymousToken },
      })
    ).status,
    403,
  );
  assert.match(response.headers.get("cache-control"), /\bno-store\b/);
  const sessionCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(".Bitacora.Session="));
  assert.match(sessionCookie, /httponly/i);
  assert.match(sessionCookie, /samesite=strict/i);
  assert.equal((await first.request("/api/auth/me")).status, 200);
  assert.equal(
    (await readFile(join(directory, "bitacora.db"))).includes(
      Buffer.from(password),
    ),
    false,
  );
});
test("writes need CSRF and an explicit create/update condition", async () => {
  assert.equal(
    (await first.request(route, { method: "PUT", body: fixture, csrf: false }))
      .status,
    403,
  );
  assert.equal(
    (await first.request(route, { method: "PUT", body: fixture })).status,
    428,
  );
  assert.equal(
    (
      await first.request(route, {
        method: "PUT",
        body: fixture,
        headers: { "If-Match": '"1"', "If-None-Match": "*" },
      })
    ).status,
    400,
  );
});
test("create and retrieve preserve unknown fields, source text, null and zero", async () => {
  const response = await first.request(route, {
    method: "PUT",
    body: fixture,
    headers: { "If-None-Match": "*" },
  });
  assert.equal(response.status, 201);
  etag = response.headers.get("etag");
  assert.equal(etag, '"1"');
  const loaded = await first.request(route);
  assert.equal(loaded.headers.get("etag"), etag);
  assert.equal(loaded.headers.get("cache-control"), "no-store");
  assert.deepEqual(await loaded.json(), fixture);
  assert.equal(
    (
      await first.request(route, {
        method: "PUT",
        body: fixture,
        headers: { "If-None-Match": "*" },
      })
    ).status,
    412,
  );
  const list = await first.request("/api/trips");
  assert.equal((await list.json()).length, 1);
});
test("invalid data, hashes, dates, foreign references and duplicates never replace the saved copy", async () => {
  const cases = [
    (b) => {
      b.schemaVersion = 99;
    },
    (b) => {
      b.data.trip.startDate = "2030-02-30";
    },
    (b) => {
      b.data.sourceSnapshots[0].files[0].rawText += " ";
    },
    (b) => {
      b.data.plannedDays[0].segments[0].stageId = "absent";
    },
    (b) => {
      b.data.plannedDays.push(b.data.plannedDays[0]);
    },
    (b) => {
      b.data.plannedDays[0].budgetEstimateClp.total = -1;
    },
    (b) => {
      b.data.stages[0].tripId = "someone-else";
    },
    (b) => {
      b.data.actualDays.push({ ...b.data.actualDays[0], id: "duplicate-date" });
    },
    (b) => {
      b.data.diaryEntries[0].actualDayId = "absent";
    },
    (b) => {
      b.data.diaryEntries[0].text = " ";
    },
    (b) => {
      b.data.diaryEntries[0].placeIds = ["absent"];
    },
    (b) => {
      b.data.places[0].latitude = 0;
    },
    (b) => {
      b.data.plannedDays[0].logistics.referenceMapUrl = "javascript:alert(1)";
    },
  ];
  for (const mutate of cases) {
    const invalid = structuredClone(fixture);
    mutate(invalid);
    assert.equal(
      (
        await first.request(route, {
          method: "PUT",
          body: invalid,
          headers: { "If-Match": etag },
        })
      ).status,
      400,
    );
  }
  const missing = structuredClone(fixture);
  delete missing.data.trip.fixedFlights;
  assert.equal(
    (
      await first.request(route, {
        method: "PUT",
        body: missing,
        headers: { "If-Match": etag },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await first.request(route, {
        method: "PUT",
        body: '{"data":',
        headers: { "If-Match": etag },
      })
    ).status,
    400,
  );
  const duplicate = JSON.stringify(fixture).replace(
    '"schemaVersion":1',
    '"schemaVersion":1,"schemaVersion":1',
  );
  assert.equal(
    (
      await first.request(route, {
        method: "PUT",
        body: duplicate,
        headers: { "If-Match": etag },
      })
    ).status,
    400,
  );
  assert.deepEqual(await (await first.request(route)).json(), fixture);
});
test("source IDs must be actual entity IDs rather than text elsewhere in the source", async () => {
  const invalid = structuredClone(fixture);
  const ref = invalid.data.stages[0].sourceRef;
  const file = invalid.data.sourceSnapshots
    .find((s) => s.id === ref.snapshotId)
    .files.find((f) => f.path === ref.path);
  file.rawText = JSON.stringify({
    schema_version: 1,
    description: ref.sourceId,
  });
  file.sha256 = createHash("sha256").update(file.rawText).digest("hex");
  assert.equal(
    (
      await first.request(route, {
        method: "PUT",
        body: invalid,
        headers: { "If-Match": etag },
      })
    ).status,
    400,
  );
});
test("users cannot see or overwrite another owner; equal trip IDs remain isolated", async () => {
  await second.login("traveler.two");
  assert.equal((await second.request(route)).status, 404);
  assert.deepEqual(await (await second.request("/api/trips")).json(), []);
  assert.equal(
    (
      await second.request(route, {
        method: "PUT",
        body: fixture,
        headers: { "If-Match": etag },
      })
    ).status,
    412,
  );
  const own = structuredClone(fixture);
  own.data.trip.name = "Otro ejemplo ficticio";
  assert.equal(
    (
      await second.request(route, {
        method: "PUT",
        body: own,
        headers: { "If-None-Match": "*" },
      })
    ).status,
    201,
  );
  assert.equal(
    (await (await first.request(route)).json()).data.trip.name,
    fixture.data.trip.name,
  );
});
test("concurrent updates with the same revision have one winner without losing data", async () => {
  const writes = [structuredClone(fixture), structuredClone(fixture)];
  writes[0].customMetadata.winner = "A";
  writes[1].customMetadata.winner = "B";
  const results = await Promise.all(
    writes.map((body) =>
      first.request(route, {
        method: "PUT",
        body,
        headers: { "If-Match": etag },
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 412]);
  const winner = writes[results.findIndex((r) => r.status === 200)];
  const loaded = await first.request(route);
  etag = loaded.headers.get("etag");
  assert.equal(etag, '"2"');
  assert.deepEqual(await loaded.json(), winner);
  assert.equal(
    (
      await first.request(route, {
        method: "PUT",
        body: fixture,
        headers: { "If-Match": '"1"' },
      })
    ).status,
    412,
  );
});
test("oversized payloads are rejected before changing storage", async () => {
  assert.equal(
    (
      await first.request(route, {
        method: "PUT",
        body: " ".repeat(5 * 1024 * 1024 + 1),
        headers: { "If-Match": etag },
      })
    ).status,
    413,
  );
  assert.equal((await first.request(route)).headers.get("etag"), etag);
});
test("SQLite copies and existing sessions survive a process restart", async () => {
  const stored = await (await first.request(route)).json();
  await stopped(server);
  await boot();
  assert.equal((await first.request("/api/auth/me")).status, 200);
  assert.deepEqual(await (await first.request(route)).json(), stored);
});
test("logout revokes the saved cookie, including replay after a new process", async () => {
  const replay = new Client();
  replay.cookies = new Map(first.cookies);
  assert.equal(
    (await first.request("/api/auth/logout", { method: "POST" })).status,
    204,
  );
  assert.equal((await replay.request("/api/auth/me")).status, 401);
  await stopped(server);
  await boot();
  assert.equal((await replay.request(route)).status, 401);
});
test("login rate limiting rejects repeated failures", async () => {
  const visitor = new Client();
  await visitor.csrf();
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    statuses.push(
      (
        await visitor.request("/api/auth/login", {
          method: "POST",
          body: { username: "nonexistent", password },
        })
      ).status,
    );
  }
  assert.equal(statuses.includes(429), true);
});
test("production rejects HTTP on private API routes", async () => {
  await stopped(server);
  await boot({ ...environment(), ASPNETCORE_ENVIRONMENT: "Production" });
  assert.equal((await second.request("/api/auth/me")).status, 400);
  assert.equal((await second.request("/api/auth/csrf")).status, 400);
});
