import "dotenv/config";
import bcrypt from "bcryptjs";
import { createPool } from "../src/db.js";
import type { Role } from "../src/lib/roles.js";
import { createUser, findUserByEmail } from "../src/repositories/users.js";

// Creates the first admin (ADMIN_EMAIL / ADMIN_PASSWORD) and, if DEMO_PASSWORD
// is set, one approved demo user per supply-chain role. Safe to re-run.
const { DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, DEMO_PASSWORD } = process.env;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set");

const demoUsers: { name: string; email: string; role: Role; organisation: string }[] = [
  { name: "Ramesh Patil", email: "farmer@demo.local", role: "farmer", organisation: "Patil Organic Farm, Nashik" },
  { name: "Green Cert Inspector", email: "certifier@demo.local", role: "certifier", organisation: "Demo Certification Body" },
  { name: "Fresh Pack Processing", email: "processor@demo.local", role: "processor", organisation: "Fresh Pack Pvt Ltd" },
  { name: "Swift Distribution", email: "distributor@demo.local", role: "distributor", organisation: "Swift Logistics" },
  { name: "Organic Mart", email: "retailer@demo.local", role: "retailer", organisation: "Organic Mart, Pune" },
];

const pool = createPool(DATABASE_URL);

async function ensure(name: string, email: string, password: string, role: Role, organisation: string | null) {
  if (await findUserByEmail(pool, email)) {
    console.log(`exists   ${role.padEnd(11)} ${email}`);
    return;
  }
  await createUser(pool, {
    name,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role,
    status: "approved",
    organisation,
  });
  console.log(`created  ${role.padEnd(11)} ${email}`);
}

try {
  await ensure("Platform Admin", ADMIN_EMAIL, ADMIN_PASSWORD, "admin", null);
  if (DEMO_PASSWORD) {
    for (const u of demoUsers) await ensure(u.name, u.email, DEMO_PASSWORD, u.role, u.organisation);
  } else {
    console.log("DEMO_PASSWORD not set: skipping demo users.");
  }
} finally {
  await pool.end();
}
