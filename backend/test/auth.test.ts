import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { chainActorId } from "../src/repositories/users.js";
import { PASSWORD, loginToken, seedUser, setup, testConfig } from "./helpers.js";

const validRegistration = {
  name: "Ramesh Patil",
  email: "Ramesh@Example.com",
  password: "organic-2026",
  role: "farmer",
  organisation: "Patil Farm",
};

describe("POST /api/auth/register", () => {
  it("creates a pending account with a lowercased email and on-chain actor id", async () => {
    const { api } = setup();
    const res = await api.post("/api/auth/register").send(validRegistration);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const user = res.body.data.user;
    expect(user).toMatchObject({ email: "ramesh@example.com", role: "farmer", status: "pending" });
    expect(user.chain_actor_id).toBe(chainActorId(user.id));
    expect(user).not.toHaveProperty("password_hash");
  });

  it("rejects a duplicate email with 409", async () => {
    const { api } = setup();
    await api.post("/api/auth/register").send(validRegistration);
    const res = await api.post("/api/auth/register").send({ ...validRegistration, email: "ramesh@example.com" });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it("does not allow self-registering as admin", async () => {
    const { api } = setup();
    const res = await api.post("/api/auth/register").send({ ...validRegistration, role: "admin" });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([expect.objectContaining({ field: "role" })]);
  });

  it("returns 400 with field details for invalid input", async () => {
    const { api } = setup();
    const res = await api.post("/api/auth/register").send({ name: "A", email: "nope", password: "short", role: "farmer" });
    expect(res.status).toBe(400);
    const fields = res.body.details.map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(["email", "name", "password"]);
  });

  it("returns 400 for malformed JSON", async () => {
    const { api } = setup();
    const res = await api.post("/api/auth/register").set("Content-Type", "application/json").send("{bad json");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Malformed JSON body");
  });
});

describe("POST /api/auth/login", () => {
  it("returns a JWT and sets an HTTP-only cookie for an approved user", async () => {
    const { api, db } = setup();
    const user = await seedUser(db, "farmer");
    const res = await api.post("/api/auth/login").send({ email: user.email.toUpperCase(), password: PASSWORD });

    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.data.token, testConfig().JWT_SECRET) as { sub: string; role: string };
    expect(payload).toMatchObject({ sub: user.id, role: "farmer" });
    expect(res.headers["set-cookie"][0]).toMatch(/^ot_token=.+HttpOnly/);
  });

  it("rejects a wrong password and an unknown email with the same 401", async () => {
    const { api, db } = setup();
    const user = await seedUser(db, "farmer");
    const wrong = await api.post("/api/auth/login").send({ email: user.email, password: "wrong-password" });
    const unknown = await api.post("/api/auth/login").send({ email: "nobody@test.local", password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
  });

  it("blocks pending and blocked accounts with 403", async () => {
    const { api, db } = setup();
    const pending = await seedUser(db, "farmer", "pending");
    const blocked = await seedUser(db, "farmer", "blocked");
    const a = await api.post("/api/auth/login").send({ email: pending.email, password: PASSWORD });
    const b = await api.post("/api/auth/login").send({ email: blocked.email, password: PASSWORD });
    expect(a.status).toBe(403);
    expect(a.body.error).toMatch(/awaiting admin approval/);
    expect(b.status).toBe(403);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the current user with a Bearer token", async () => {
    const { api, db } = setup();
    const user = await seedUser(db, "retailer");
    const token = await loginToken(api, user.email);
    const res = await api.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ id: user.id, role: "retailer" });
  });

  it("accepts the auth cookie", async () => {
    const { api, db } = setup();
    const user = await seedUser(db, "retailer");
    const login = await api.post("/api/auth/login").send({ email: user.email, password: PASSWORD });
    const cookie = login.headers["set-cookie"][0].split(";")[0];
    const res = await api.get("/api/auth/me").set("Cookie", cookie);
    expect(res.status).toBe(200);
  });

  it("returns 401 without a token or with a bad/expired token", async () => {
    const { api, db } = setup();
    const user = await seedUser(db, "farmer");
    const expired = jwt.sign({ sub: user.id, role: "farmer" }, testConfig().JWT_SECRET, { expiresIn: -10 });
    const forged = jwt.sign({ sub: user.id, role: "admin" }, "some-other-secret-some-other-secret");

    expect((await api.get("/api/auth/me")).status).toBe(401);
    expect((await api.get("/api/auth/me").set("Authorization", `Bearer ${expired}`)).status).toBe(401);
    expect((await api.get("/api/auth/me").set("Authorization", `Bearer ${forged}`)).status).toBe(401);
  });
});

describe("admin user approval", () => {
  it("lets an admin list pending users and approve one, who can then log in", async () => {
    const { api, db } = setup();
    const admin = await seedUser(db, "admin");
    const adminToken = await loginToken(api, admin.email);
    const reg = await api.post("/api/auth/register").send(validRegistration);
    const newUserId = reg.body.data.user.id;

    const list = await api.get("/api/admin/users?status=pending").set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.users.map((u: { id: string }) => u.id)).toEqual([newUserId]);

    const approve = await api
      .patch(`/api/admin/users/${newUserId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "approved" });
    expect(approve.status).toBe(200);
    expect(approve.body.data.user.status).toBe("approved");

    const login = await api
      .post("/api/auth/login")
      .send({ email: validRegistration.email, password: validRegistration.password });
    expect(login.status).toBe(200);
  });

  it("cuts off a blocked user's existing session immediately", async () => {
    const { api, db } = setup();
    const admin = await seedUser(db, "admin");
    const farmer = await seedUser(db, "farmer");
    const adminToken = await loginToken(api, admin.email);
    const farmerToken = await loginToken(api, farmer.email);

    await api
      .patch(`/api/admin/users/${farmer.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "blocked" });

    const res = await api.get("/api/auth/me").set("Authorization", `Bearer ${farmerToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 403 for non-admin roles", async () => {
    const { api, db } = setup();
    for (const role of ["farmer", "certifier", "processor", "distributor", "retailer"] as const) {
      const user = await seedUser(db, role);
      const token = await loginToken(api, user.email);
      const res = await api.get("/api/admin/users").set("Authorization", `Bearer ${token}`);
      expect(res.status, role).toBe(403);
    }
  });

  it("validates the target id and status, and refuses self-changes", async () => {
    const { api, db } = setup();
    const admin = await seedUser(db, "admin");
    const token = await loginToken(api, admin.email);
    const auth = { Authorization: `Bearer ${token}` };

    expect((await api.patch("/api/admin/users/not-a-uuid").set(auth).send({ status: "approved" })).status).toBe(400);
    expect(
      (await api.patch(`/api/admin/users/${admin.id}`).set(auth).send({ status: "pending" })).status,
    ).toBe(400);
    expect((await api.patch(`/api/admin/users/${admin.id}`).set(auth).send({ status: "blocked" })).status).toBe(400);
    expect(
      (await api.patch("/api/admin/users/00000000-0000-4000-8000-000000000000").set(auth).send({ status: "approved" }))
        .status,
    ).toBe(404);
  });
});

describe("misc", () => {
  it("serves health and 404s unknown routes as JSON", async () => {
    const { api } = setup();
    expect((await api.get("/api/health")).body).toEqual({ success: true, data: { status: "ok" } });
    const res = await api.get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
