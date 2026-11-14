const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

const app = require("../src/app");
const authService = require("../src/modules/auth/auth.service");
const auditService = require("../src/modules/audit/audit.service");

function parseBody(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function request(server, method, path, body, headers = {}) {
  const address = server.address();
  const payload = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: address.port,
        method,
        path,
        headers: {
          ...headers,
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            body: parseBody(data),
          });
        });
      },
    );

    req.on("error", reject);

    if (payload) {
      req.write(payload);
    }

    req.end();
  });
}

function tokenFor(role) {
  return authService.issueToken({
    id: `${role}-id`,
    role,
    status: "approved",
  });
}

test("GET /api/audit without token returns 401", async () => {
  const server = app.listen(0);

  try {
    const response = await request(server, "GET", "/api/audit");

    assert.equal(response.statusCode, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /api/audit with a non-admin token returns 403", async () => {
  const server = app.listen(0);

  try {
    const response = await request(server, "GET", "/api/audit", null, {
      Authorization: `Bearer ${tokenFor("citizen")}`,
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /api/audit with an admin token returns paginated audit data", async () => {
  const originalList = auditService.list;

  auditService.list = async (filters) => {
    assert.equal(filters.entityType, "user");
    assert.equal(filters.page, 1);
    assert.equal(filters.limit, 25);

    return {
      data: [{ id: "1", action: "update", entityType: "user", entityId: "user-1" }],
      meta: { total: 1, page: 1, limit: 25 },
    };
  };

  const server = app.listen(0);

  try {
    const response = await request(server, "GET", "/api/audit?entityType=user", null, {
      Authorization: `Bearer ${tokenFor("admin")}`,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.data.length, 1);
    assert.deepEqual(response.body.meta, { total: 1, page: 1, limit: 25 });
  } finally {
    auditService.list = originalList;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/audit is not exposed by the read-only module", async () => {
  const server = app.listen(0);

  try {
    const response = await request(server, "POST", "/api/audit", { action: "update" }, {
      Authorization: `Bearer ${tokenFor("admin")}`,
    });

    assert.equal(response.statusCode, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
