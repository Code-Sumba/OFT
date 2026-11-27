# Organic Trace

Organic food supply chain traceability on Polygon Amoy. Batches are registered, certified and handed over Farmer → Processor → Distributor → Retailer; consumers verify them by scanning a QR code. See `docs/` for the PRD, TRD, roadmap and tech stack.

## Layout

```
contracts/   OrganicTrace.sol (stage order + certification enforced on-chain)
             naive/OrganicTraceNaive.sol (gas comparison only, never deployed)
test/        Hardhat contract tests
scripts/     deploy.ts, gas-report.ts, export-abi.ts
backend/     Express API, relayer, event indexer, fraud engine
frontend/    Next.js 16 app: role dashboards, public QR trace page, admin panel
db/          schema.sql
docs/        Project documents
```

## Prerequisites

Node.js 20 LTS (Hardhat 2 warns on newer versions but works), Git, a Supabase project and test wallets on Polygon Amoy.

```bash
npm install                 # contract toolchain (repo root)
npm --prefix backend install
cp .env.example .env        # fill in; copy the same file to backend/.env
```

## Smart contract

```bash
npm test                    # 25 Hardhat tests
npm run test:gas            # same, with a per-function gas table
npm run deploy:local        # dry run on the in-memory network
npm run deploy:amoy         # needs DEPLOYER_PRIVATE_KEY and test POL
```

`deploy.ts` grants `RELAYER_ROLE` to `RELAYER_ADDRESS` (defaults to the deployer) and `CERTIFIER_ROLE` to `CERTIFIER_ADDRESS` if set, writes the address, ABI and deploy block to `deployments/<network>.json`, and verifies the contract on the explorer.

Differences from the TRD:

- `transferBatch(batchId, toActor, toStage, location)` takes an explicit `toStage`. The contract reverts unless it is exactly one stage ahead, so stage skipping is rejected on-chain rather than impossible to express.
- `certifyBatch` can be called again until the batch is sold: to renew an expiring certificate, or to revoke approval (which blocks further transfers).
- `markSold` also appends a history entry (to actor `0x0`, stage `Sold`), so `getHistory` holds the full timeline.
- `BatchCertified` also carries the certificate CID, so the indexer can record certificates from events alone.

`npm run compile` also copies the ABI to `backend/src/chain/OrganicTrace.abi.json`; rerun it after changing the contract.

## Backend

Two processes share one codebase: the **API** and the **indexer** (polls contract events into PostgreSQL and resumes from the last processed block after a restart).

```bash
cd backend
npm run db:migrate          # applies ../db/schema.sql to DATABASE_URL
npm run db:seed             # creates the admin (+ demo users if DEMO_PASSWORD is set)
npm run dev                 # API on http://localhost:4000
npm run dev:indexer         # event indexer
npm test                    # starts a local Hardhat node, deploys the contract, runs all API tests
```

`npm test` needs the root `npm install` done (it uses Hardhat from the repo root) and uses an in-memory Postgres (pg-mem) with the real schema.

### Local chain instead of Amoy

```bash
npm run node                # repo root: Hardhat node on :8545
npm run deploy:localhost    # writes deployments/localhost.json
```

Then in `backend/.env`: `RPC_URL=http://127.0.0.1:8545`, `CONTRACT_ADDRESS` from that file, `RELAYER_PRIVATE_KEY` = Hardhat account #0, `MIN_PRIORITY_FEE_GWEI=0`, `INDEXER_CONFIRMATIONS=0`.

### How writes work

1. The API checks the role and business rules (current holder, next role only, certified, future expiry...).
2. The relayer wallet signs and sends the transaction (one at a time, so nonces stay ordered).
3. After confirmation, the API applies the transaction's events to the database and recomputes the trust score. The indexer applies the same events again later; both paths are idempotent and never roll state back with an older event.
4. If the network does not confirm within `TX_TIMEOUT_MS`, the API answers `202` with the transaction hash and the indexer picks it up when it lands.

The contract is the final guard: even if the database were wrong, an invalid transfer reverts and the API returns `409` with the contract error name.

### Endpoints

| Method | Path | Access |
|---|---|---|
| POST | `/api/auth/register` | Public; account starts `pending` |
| POST | `/api/auth/login` | Public; returns JWT and sets an HTTP-only cookie |
| POST | `/api/auth/logout` | Public |
| GET | `/api/auth/me` | Any approved user |
| GET | `/api/users?role=` | Any user; approved participants of a role (for choosing a transfer recipient) |
| POST | `/api/upload` (multipart `file`) | Farmer, Certifier; PDF/PNG/JPEG/WebP up to 5 MB, type checked by content |
| POST | `/api/batches` | Farmer; registers in DB and on-chain |
| GET | `/api/batches?q=&status=&stage=` | Any user; admin/certifier see all, farmer own, others what they hold or held |
| GET | `/api/batches/:code` | Any user; batch, events, certificates |
| POST | `/api/batches/:code/certify` `{approved, expiry?, certificateCid?}` | Certifier |
| POST | `/api/batches/:code/transfer` `{toUserId, location}` | Current holder; recipient must be the next role |
| POST | `/api/batches/:code/sold` `{location}` | Holding retailer |
| GET | `/api/batches/:code/qr[?format=svg]` | Holding retailer, Admin |
| GET | `/api/trace/:code` | Public; journey, certificate, trust score, chain verification |
| GET | `/api/admin/users?status=&role=` | Admin |
| PATCH | `/api/admin/users/:id` `{status: approved \| blocked}` | Admin |
| GET | `/api/admin/fraud-alerts?resolved=&severity=` | Admin |
| PATCH | `/api/admin/fraud-alerts/:id` | Admin; dismiss (reopens if the rule still triggers) |

Every protected request reloads the user, so blocking an account takes effect immediately. Each user has a `chain_actor_id` (keccak256 of their UUID): the id recorded on-chain for them.

### Fraud engine

| Rule | Condition | Impact |
|---|---|---|
| R1 | Not certified | -40 |
| R2 | Database differs from the chain (fields, owner, or any hand-over) | -30 |
| R3 | Certificate expired | -25 |
| R4 | More than 3 transfers within any 1-hour window | -10 per extra transfer, max -20 |
| R5 | Rejected by certifier (replaces R1) | -60 |

Score = 100 minus impacts, clamped to 0-100: 80+ verified, 50-79 caution, below 50 suspicious. It runs after every applied event and on every trace request; chain comparisons are cached for 30 s and time out after 2.5 s (R2 is then skipped, not failed). Open alerts are kept one per batch and rule, and resolved automatically when the rule clears.

## Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:3000 (backend must be running on :4000)
npm run build && npm start  # production
```

The browser only talks to the Next.js origin: `/api/*` is rewritten to the backend (`API_URL`, default `http://localhost:4000`), so the HTTP-only login cookie is first-party. The public trace page `/trace/[code]` renders on the server and streams the verification result.

| Route | Who |
|---|---|
| `/` | Public landing page with batch-code search |
| `/trace/[code]` | Public: journey, certificate, trust score, blockchain check (QR target) |
| `/login`, `/register` | Participants |
| `/dashboard/farmer` | Register batches (certificate upload to IPFS), transfer to processor |
| `/dashboard/certifier` | Approve/reject with expiry, renew or revoke |
| `/dashboard/processor`, `/distributor`, `/retailer` | Batches in custody, transfer onward; retailer prints QR labels and marks sold |
| `/dashboard/batches/[code]` | Batch detail and certification history |
| `/admin` | Overview charts, user approvals, fraud alerts, all batches, gas analysis |

## Gas analysis

```bash
npx hardhat run scripts/gas-report.ts   # writes backend/data/gas-report.json (shown in /admin)
```

Same lifecycle (register, certify, 3 transfers, sold) on both designs, 5 batches. Latest result: the hybrid design uses **53.6% less gas** per batch (1,139,450 vs 2,455,958 gas).

## Production deployment

`docker-compose.yml` runs the three processes (website, API, indexer) from `frontend/Dockerfile` and `backend/Dockerfile`. It works with Coolify ("Docker Compose" resource) or plain Docker.

1. **Database:** create a Supabase project on a paid plan (free projects are paused, then deleted, when idle). Put its Session pooler string in `DATABASE_URL`.
2. **Wallet:** fund the relayer wallet. One full batch lifecycle uses about 1.14M gas (about 0.03 POL at 30 gwei), so keep at least 0.5 POL on it.
3. **`backend/.env`:** start from `.env.example`. Set `NODE_ENV=production` and `NEXT_PUBLIC_SITE_URL=https://your-domain` (the API refuses to start with a localhost URL in production, because that URL is printed in every QR code). Set `DEPLOY_BLOCK` to the current block when you start with an empty database, so the indexer does not scan millions of old blocks.
4. **Start:**
   ```bash
   docker compose up -d --build
   docker compose run --rm api node dist/scripts/migrate.js
   docker compose run --rm api node dist/scripts/seed.js
   ```
5. **Network:** put HTTPS in front of the `web` service, port 3000 (Coolify does this). Never publish the API port: only Next.js should reach it. `TRUST_PROXY=1` relies on that to read the visitor IP for rate limiting.

Rate limits are per visitor IP and set in env: `TRACE_RATE_LIMIT_PER_MIN` (120), `LOGIN_RATE_LIMIT` (20 failed logins per 15 min; successful ones are not counted) and `REGISTER_RATE_LIMIT` (10 per hour).

A batch whose certificate has expired cannot be transferred until a certifier renews it (the API checks this; the contract only checks expiry when a batch is certified).

## Documentation

PDF guides are in [`docs/pdf/`](docs/pdf/): installation, setup and deployment, website user guide, FAQ, viva preparation, architecture and design, API, database schema and queries, coding standards, test plan, quality metrics, release notes, and the project tracking pack. The API is also described in [`docs/organic-trace-openapi.json`](docs/organic-trace-openapi.json) (OpenAPI 3.1; imports into Postman). To edit a guide, change its HTML in `docs/pdf-source/` and run `node docs/pdf-source/print.mjs` (needs Google Chrome).

## Running everything locally

Three terminals:

```bash
cd backend && npm run dev            # API      :4000
cd backend && npm run dev:indexer    # indexer
cd frontend && npm run dev           # website  :3000
```

Demo logins (after `npm run db:seed`): `farmer@demo.local`, `certifier@demo.local`, `processor@demo.local`, `distributor@demo.local`, `retailer@demo.local` with `DEMO_PASSWORD`; admin with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
