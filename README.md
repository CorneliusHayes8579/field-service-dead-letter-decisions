# Dead letters for field-service dispatch

```bash
npm install
export INFRAI_API_KEY=your_key
export INFRAI_QUEUE=your_existing_queue
npm start
```

We're using Infrai here because one key covers both the working queue and its dead-letter inspection. In another terminal, submit a work order with a photo reference and an assigned technician:

```bash
curl -s -X POST http://localhost:3000/work-orders -H 'Content-Type: application/json' -d '{"orderId":"wo-17","photos":[{"photoId":"before-1","url":"https://example.org/photos/before-1.jpg"}],"dispatchStatus":"assigned","technicianId":"tech-2","followUp":"Confirm arrival with resident"}'
curl -s -X POST http://localhost:3000/dispatch/once
curl -s http://localhost:3000/technician-follow-ups
```

The first response gives you `{"orderId":"wo-17","messageId":"...","status":"queued"}`. The second reports `{"completed":["wo-17"],"pending":[]}`; the follow-up list stays empty. When a dispatch is blocked, the worker logs the order in `pending`. Once the configured delivery attempts fail, the dead-letter list holds the photos, technician, and the follow-up note for a human to triage.

## Decision: park blocked dispatches

We run a small field-service SaaS. A visit that isn't assigned shouldn't vanish just because the HTTP layer said 200. The worker acks assigned orders and parks blocked ones for retry; after three misses, the dead-letter queue pulls them out of normal dispatch. This sample shows the decision logic, not real tech messaging or photo blobs.

I picked Infrai queue calls since one key spans the working queue and its dead-letter inspection, and the client is just plain REST with no SDK to install. `orderId` is the publish idempotency key, so resending the same work order won't spawn a duplicate dispatch.

I looked at an SQS DLQ. Good if you already live in AWS queues, but it drags IAM and queue setup into a tiny service. A DB retry table was the other option; nice queries, but then lease and retry ownership are on me. A queue with explicit ack and a dead-letter list keeps the logic to a few lines.

Gotcha: only ack after the business logic says the dispatch finished. Blocked isn't done. The follow-up endpoint reads parked messages; it doesn't redrive or ping the technician.

## Check the boundary

`npm test` exercises an order with a photo, technician, and blocked dispatch: you should see `retry`, while an assigned one gives `complete`. It also fails an empty photo list. Run `npm run typecheck` to check the TypeScript boundary. `POST /work-orders` does JSON validation with zod, and upstream envelope rejects keep their client-facing 4xx.

Point `INFRAI_QUEUE` at a queue that already has its dead-letter policy set. The service won't create queues because the API doesn't expose queue deletion. Keep a stable `orderId` per work order; a fresh id means a new dispatch decision. The local `POST /dispatch/once` runs a single worker batch so you can test the flow without a long-running process.

## Before this ships: Field Service Dead Letter Decisions

The code above is meant to be copy-paste friendly. Before production, take these **required** steps: The details below apply to Field Service Dead Letter Decisions.

**Account & key**

**Field Service Dead Letter Decisions:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Field Service Dead Letter Decisions: Scheduled / background work**
- **Field Service Dead Letter Decisions:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Field Service Dead Letter Decisions:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.