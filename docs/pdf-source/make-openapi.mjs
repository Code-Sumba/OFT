// Writes organic-trace-openapi.json (OpenAPI 3.1) describing the Organic Trace API.
import fs from "node:fs";

const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const envelope = (data) => ({
  type: "object",
  required: ["success", "data"],
  properties: { success: { const: true }, data },
});
const json = (schema) => ({ "application/json": { schema } });
const ok = (description, data, status = "200") => ({ [status]: { description, content: json(envelope(data)) } });
const err = (...codes) =>
  Object.fromEntries(codes.map((c) => [String(c), { $ref: `#/components/responses/E${c}` }]));
const obj = (properties, required = Object.keys(properties)) => ({ type: "object", properties, required });
const str = (extra = {}) => ({ type: "string", ...extra });
const codeParam = { name: "code", in: "path", required: true, schema: str({ example: "OT-2026-4QNEHY" }) };
const auth = [{ cookieAuth: [] }, { bearerAuth: [] }];
const txWrite = {
  ...ok("Confirmed on-chain and applied", obj({ batch: ref("Batch"), tx: ref("Tx") })),
  202: { description: "Sent; not yet confirmed (the indexer records it later)", content: json(envelope(obj({ batch: ref("Batch"), tx: ref("Tx"), message: str() }))) },
};

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Organic Trace API",
    version: "1.0.0",
    description:
      "Farm-to-shelf organic produce traceability on Polygon. All responses use the envelope {success, data} or {success:false, error, details}.",
  },
  servers: [{ url: "http://localhost:3000", description: "Local (through the website)" }, { url: "https://your-domain", description: "Production" }],
  tags: ["auth", "users", "upload", "batches", "trace", "admin"].map((name) => ({ name })),
  paths: {
    "/api/health": { get: { tags: ["auth"], summary: "Health check", responses: ok("API is up", obj({ status: str({ const: "ok" }) })) } },
    "/api/auth/register": {
      post: {
        tags: ["auth"], summary: "Create a pending account",
        requestBody: { required: true, content: json(obj({
          name: str({ minLength: 2, maxLength: 100 }), email: str({ format: "email", maxLength: 254 }),
          password: str({ minLength: 8, maxLength: 72 }), role: ref("SelfRole"), organisation: str({ maxLength: 150 }),
        }, ["name", "email", "password", "role"])) },
        responses: { ...ok("Created", obj({ user: ref("User"), message: str() }), "201"), ...err(400, 409, 429) },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["auth"], summary: "Log in; returns a JWT and sets the ot_token cookie",
        requestBody: { required: true, content: json(obj({ email: str({ format: "email" }), password: str({ maxLength: 72 }) })) },
        responses: { ...ok("Logged in", obj({ token: str(), user: ref("User") })), ...err(400, 401, 403, 429) },
      },
    },
    "/api/auth/logout": { post: { tags: ["auth"], summary: "Clear the auth cookie", responses: ok("Logged out", obj({ loggedOut: { const: true } })) } },
    "/api/auth/me": { get: { tags: ["auth"], summary: "Current user", security: auth, responses: { ...ok("Current user", obj({ user: ref("User") })), ...err(401, 403) } } },
    "/api/users": {
      get: {
        tags: ["users"], summary: "Approved participants of a role (no emails)", security: auth,
        parameters: [{ name: "role", in: "query", required: true, schema: ref("SelfRole") }],
        responses: { ...ok("Participants", obj({ users: { type: "array", items: ref("Party") } })), ...err(400, 401) },
      },
    },
    "/api/upload": {
      post: {
        tags: ["upload"], summary: "Upload a certificate to IPFS (Farmer, Certifier)", security: auth,
        requestBody: { required: true, content: { "multipart/form-data": { schema: obj({ file: str({ format: "binary", description: "PDF, PNG, JPEG or WebP, max 5 MB" }) }) } } },
        responses: { ...ok("Pinned", obj({ cid: str(), url: str({ format: "uri" }), mimeType: str(), size: { type: "integer" } }), "201"), ...err(400, 401, 403, 413, 502, 503) },
      },
    },
    "/api/batches": {
      post: {
        tags: ["batches"], summary: "Register a batch on-chain (Farmer)", security: auth,
        requestBody: { required: true, content: json(obj({
          product: str({ minLength: 2, maxLength: 100 }), quantity: { type: "number", exclusiveMinimum: 0, maximum: 1000000 },
          unit: { enum: ["kg", "quintal", "tonne", "litre", "dozen", "piece"] }, origin: str({ minLength: 2, maxLength: 100 }),
          harvestDate: str({ format: "date" }), certificateCid: str({ pattern: "^[a-zA-Z0-9]{46,100}$" }),
        }, ["product", "quantity", "unit", "origin", "harvestDate"])) },
        responses: { ...ok("Registered", obj({ batch: ref("Batch"), tx: ref("Tx") }), "201"), 202: txWrite[202], ...err(400, 401, 403, 409, 502) },
      },
      get: {
        tags: ["batches"], summary: "List batches visible to the user", security: auth,
        parameters: [
          { name: "q", in: "query", schema: str({ maxLength: 50 }) },
          { name: "status", in: "query", schema: ref("Status") },
          { name: "stage", in: "query", schema: ref("Stage") },
        ],
        responses: { ...ok("Batches", obj({ batches: { type: "array", items: ref("Batch") } })), ...err(400, 401) },
      },
    },
    "/api/batches/{code}": {
      get: {
        tags: ["batches"], summary: "Batch details", security: auth, parameters: [codeParam],
        responses: { ...ok("Batch", obj({
          batch: ref("Batch"), events: { type: "array", items: ref("Event") }, certificates: { type: "array", items: ref("Certificate") },
          nextStage: { oneOf: [ref("Stage"), { type: "null" }] }, canTransfer: { type: "boolean" },
        })), ...err(400, 401, 404) },
      },
    },
    "/api/batches/{code}/certify": {
      post: {
        tags: ["batches"], summary: "Approve (with expiry) or reject (Certifier)", security: auth, parameters: [codeParam],
        requestBody: { required: true, content: json({ oneOf: [
          obj({ approved: { const: true }, expiry: str({ format: "date" }), certificateCid: str() }, ["approved", "expiry"]),
          obj({ approved: { const: false } }),
        ] }) },
        responses: { ...txWrite, ...err(400, 401, 403, 404, 409, 502) },
      },
    },
    "/api/batches/{code}/transfer": {
      post: {
        tags: ["batches"], summary: "Hand over to the next role (current holder)", security: auth, parameters: [codeParam],
        requestBody: { required: true, content: json(obj({ toUserId: str({ format: "uuid" }), location: str({ minLength: 2, maxLength: 100 }) })) },
        responses: { ...txWrite, ...err(400, 401, 403, 404, 409, 502) },
      },
    },
    "/api/batches/{code}/sold": {
      post: {
        tags: ["batches"], summary: "Mark sold (holding retailer)", security: auth, parameters: [codeParam],
        requestBody: { required: true, content: json(obj({ location: str({ minLength: 2, maxLength: 100 }) })) },
        responses: { ...txWrite, ...err(400, 401, 403, 404, 409, 502) },
      },
    },
    "/api/batches/{code}/qr": {
      get: {
        tags: ["batches"], summary: "QR label image (holding retailer, admin)", security: auth,
        parameters: [codeParam, { name: "format", in: "query", schema: { enum: ["svg"] } }],
        responses: { 200: { description: "QR code", content: { "image/png": {}, "image/svg+xml": {} } }, ...err(401, 403, 404) },
      },
    },
    "/api/trace/{code}": {
      get: {
        tags: ["trace"], summary: "Public verification for the QR page", parameters: [codeParam],
        responses: { ...ok("Trace", obj({
          batch: ref("Batch"), timeline: { type: "array", items: ref("Event") }, certificates: { type: "array", items: ref("Certificate") },
          trust: obj({ score: { type: "integer", minimum: 0, maximum: 100 }, band: { enum: ["verified", "caution", "suspicious"] }, rules: { type: "array", items: ref("Rule") } }),
          verification: obj({
            badge: { enum: ["verified", "warning"] }, chainChecked: { type: "boolean" }, matchesChain: { type: ["boolean", "null"] },
            differences: { type: "array", items: str() }, contract: obj({ address: str(), url: str() }),
          }),
        })), ...err(404, 429) },
      },
    },
    "/api/admin/users": {
      get: {
        tags: ["admin"], summary: "List users", security: auth,
        parameters: [{ name: "status", in: "query", schema: { enum: ["pending", "approved", "blocked"] } }, { name: "role", in: "query", schema: ref("Role") }],
        responses: { ...ok("Users", obj({ users: { type: "array", items: ref("User") } })), ...err(401, 403) },
      },
    },
    "/api/admin/users/{id}": {
      patch: {
        tags: ["admin"], summary: "Approve or block a user", security: auth,
        parameters: [{ name: "id", in: "path", required: true, schema: str({ format: "uuid" }) }],
        requestBody: { required: true, content: json(obj({ status: { enum: ["approved", "blocked"] } })) },
        responses: { ...ok("Updated", obj({ user: ref("User") })), ...err(400, 401, 403, 404) },
      },
    },
    "/api/admin/fraud-alerts": {
      get: {
        tags: ["admin"], summary: "Fraud alerts (max 200, newest first)", security: auth,
        parameters: [{ name: "resolved", in: "query", schema: { enum: ["true", "false"] } }, { name: "severity", in: "query", schema: { enum: ["medium", "high"] } }],
        responses: { ...ok("Alerts", obj({ alerts: { type: "array", items: ref("Alert") } })), ...err(401, 403) },
      },
    },
    "/api/admin/fraud-alerts/{id}": {
      patch: {
        tags: ["admin"], summary: "Dismiss an alert", security: auth,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { ...ok("Dismissed", obj({ alert: ref("Alert") })), ...err(401, 403, 404) },
      },
    },
    "/api/admin/analytics": { get: { tags: ["admin"], summary: "Platform counts and 14-day activity", security: auth, responses: { ...ok("Analytics", { type: "object" }), ...err(401, 403) } } },
    "/api/admin/gas-report": { get: { tags: ["admin"], summary: "Naive vs hybrid gas comparison", security: auth, responses: { ...ok("Report", obj({ report: { type: "object" } })), ...err(401, 403, 404) } } },
  },
  components: {
    securitySchemes: {
      cookieAuth: { type: "apiKey", in: "cookie", name: "ot_token" },
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    responses: Object.fromEntries(
      [
        [400, "Validation failed or invalid input"], [401, "Not logged in / invalid credentials"], [403, "Not allowed"],
        [404, "Not found"], [409, "Conflicts with the batch's current state or a contract rule"], [413, "File larger than 5 MB"],
        [429, "Rate limit exceeded"], [502, "Blockchain or IPFS unavailable"], [503, "Uploads not configured"],
      ].map(([c, d]) => [`E${c}`, { description: d, content: json(ref("Error")) }]),
    ),
    schemas: {
      Error: obj({ success: { const: false }, error: str(), details: {} }, ["success", "error"]),
      Role: { enum: ["admin", "farmer", "certifier", "processor", "distributor", "retailer"] },
      SelfRole: { enum: ["farmer", "certifier", "processor", "distributor", "retailer"] },
      Status: { enum: ["registered", "certified", "rejected"] },
      Stage: { enum: ["farmer", "processor", "distributor", "retailer", "sold"] },
      User: obj({
        id: str({ format: "uuid" }), name: str(), email: str({ format: "email" }), role: ref("Role"),
        status: { enum: ["pending", "approved", "blocked"] }, organisation: { type: ["string", "null"] },
        chain_actor_id: str({ description: "keccak256 of id" }), created_at: str({ format: "date-time" }),
      }),
      Party: obj({ id: str({ format: "uuid" }), name: str(), organisation: { type: ["string", "null"] }, role: ref("Role") }),
      TxLink: obj({ hash: { type: ["string", "null"] }, url: { type: ["string", "null"] } }),
      Tx: obj({ hash: str(), url: { type: ["string", "null"] }, confirmed: { type: "boolean" } }),
      Batch: obj({
        code: str(), product: str(), quantity: { type: "number" }, unit: str(), origin: str(), harvestDate: str({ format: "date" }),
        status: ref("Status"), stage: ref("Stage"), farmer: { oneOf: [ref("Party"), { type: "null" }] }, currentOwner: { oneOf: [ref("Party"), { type: "null" }] },
        certificate: obj({ cid: { type: ["string", "null"] }, url: { type: ["string", "null"] }, expiry: { type: ["string", "null"] }, expired: { type: "boolean" } }),
        trustScore: { type: "integer" }, registerTx: ref("TxLink"), onChain: { type: "boolean" }, createdAt: str({ format: "date-time" }),
      }),
      Event: obj({
        type: { enum: ["registered", "certified", "rejected", "transferred", "sold"] }, stage: { oneOf: [ref("Stage"), { type: "null" }] },
        location: { type: ["string", "null"] }, time: str({ format: "date-time" }),
        from: { oneOf: [ref("Party"), { type: "null" }] }, to: { oneOf: [ref("Party"), { type: "null" }] },
        tx: obj({ hash: str(), url: { type: ["string", "null"] }, block: { type: "integer" } }),
      }),
      Certificate: obj({
        approved: { type: "boolean" }, cid: { type: ["string", "null"] }, url: { type: ["string", "null"] }, expiry: { type: ["string", "null"] },
        certifier: { oneOf: [ref("Party"), { type: "null" }] }, tx: ref("TxLink"), at: str({ format: "date-time" }),
      }),
      Rule: obj({ rule: { enum: ["R1", "R2", "R3", "R4", "R5"] }, label: str(), severity: { enum: ["medium", "high"] }, impact: { type: "integer" }, details: str() }),
      Alert: obj({
        id: { type: "integer" }, batch_code: str(), rule: { enum: ["R1", "R2", "R3", "R4", "R5"] }, severity: { enum: ["medium", "high"] },
        details: { type: ["string", "null"] }, resolved: { type: "boolean" }, created_at: str({ format: "date-time" }),
        product: str(), trust_score: { type: "integer" },
      }, ["id", "batch_code", "rule", "severity", "resolved", "created_at"]),
    },
  },
};

const out = process.argv[2];
fs.writeFileSync(out, JSON.stringify(spec, null, 2));
console.log("wrote", out, Object.keys(spec.paths).length, "paths");
