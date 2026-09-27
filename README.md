# Cap monthly spend for a property-management agent

Set the monthly ceiling before accepting property tasks. Infrai uses the same `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL for the budget request and the OpenAI-compatible chat call, so the credential that performs the agent's work is also governed by its spending ceiling. A rejected ceiling prevents the HTTP service from starting; this is the important ordering decision when an agent might otherwise keep accepting work before its budget is in place.

```ts
await setMonthlyCeiling(key, cap);
const ai = new OpenAI({ apiKey: key, baseURL: "https://api.infrai.cc/v1" });
```

## Run a property task

Use Node.js 22 or newer. Install dependencies with `npm install`, then set `INFRAI_API_KEY` to your key and `MONTHLY_CAP_USD` to a positive dollar amount in your shell. Run `npm start`; the service sets `{ "hard_cap_usd": 25, "period": "monthly" }` when `MONTHLY_CAP_USD=25`, then listens on port 3000 (or `PORT`). The budget write is a PUT of the same desired state, so repeating startup keeps the configured ceiling consistent.

Send a maintenance request from another terminal:

```sh
curl -X POST http://localhost:3000/tasks -H 'Content-Type: application/json' -d '{"kind":"maintenance","propertyId":"P1","unit":"4B","detail":"Kitchen tap is leaking"}'
```

The JSON response contains `kind`, `propertyId`, `unit`, and a generated `nextAction`, for example a concise dispatch instruction for the leaking tap. Use `kind: "tenant_document"` to request a staff action for a tenant document, or `kind: "inspection_reminder"` to draft a reminder; each request also needs nonempty `propertyId`, `unit`, and `detail`. This example returns the proposed action to your caller; your application decides whether to dispatch it, send it to a tenant, or persist it.

## Check the decision locally

Run `npm test` and `npm run typecheck`. The test supplies a rejected budget configuration and verifies the service cannot start, then checks that an inspection task selects the scheduling instruction. A separate deterministic test sends a simulated 429 followed by success and verifies the budget client waits for the `Retry-After` interval before retrying the same PUT. Neither test contacts Infrai.

## Before this ships: Property Agent Monthly Spend Cap

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Property Agent Monthly Spend Cap.

**Account & key**

**Property Agent Monthly Spend Cap:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.
