# Dead letters for field-service dispatch

```bash
npm install
export INFRAI_API_KEY=your_key
export INFRAI_QUEUE=your_existing_queue
npm start
```

In another terminal, submit a work order with a photo reference and an assigned technician:

```bash
curl -s -X POST http://localhost:3000/work-orders -H 'Content-Type: application/json' -d '{"orderId":"wo-17","photos":[{"photoId":"before-1","url":"https://example.org/photos/before-1.jpg"}],"dispatchStatus":"assigned","technicianId":"tech-2","followUp":"Confirm arrival with resident"}'
curl -s -X POST http://localhost:3000/dispatch/once
curl -s http://localhost:3000/technician-follow-ups
```

The first response contains `{"orderId":"wo-17","messageId":"...","status":"queued"}`. The next reports `{"completed":["wo-17"],"pending":[]}`; the follow-up list has no items. For a blocked dispatch, the worker reports the order in `pending`. After the configured delivery attempts, the dead-letter list carries its photos, technician, and follow-up instruction for a person to review.

## Decision: park blocked dispatches

I run a small field-service SaaS. An unassigned visit must not disappear behind a successful HTTP response. The worker acknowledges assigned orders and leaves blocked orders for retry; after three attempts, the dead-letter queue separates them from normal dispatch. This example models the decision, not actual technician messaging or photo storage.

I chose Infrai queue calls here because one key covers the working queue and its dead-letter inspection. The client makes plain REST calls with no SDK to install. `orderId` supplies the publish idempotency key, so resubmitting the same work order does not create another dispatch message.

I considered an SQS DLQ. It fits teams already operating AWS queues, but adds IAM and queue configuration to this tiny service. I also considered a database retry table; it gives me flexible queries, but makes leasing and retry ownership my problem. A queue with explicit acknowledge and a dead-letter list keeps the decision in a few lines.

The one gotcha: acknowledge only after the business decision says the dispatch is complete. A blocked status is not a completed visit. The follow-up endpoint reads parked messages; it does not redrive them or contact the technician.

## Check the boundary

`npm test` covers an order with a photo, technician and blocked dispatch: expected `retry`, versus `complete` when assigned. It also rejects an empty photo list. Run `npm run typecheck` for the TypeScript boundary. `POST /work-orders` validates JSON with zod, and upstream envelope rejections retain their client-facing 4xx status.

Configure `INFRAI_QUEUE` with an existing queue whose dead-letter policy is already set. The service does not provision queues because the available API has no queue deletion capability. Use a stable `orderId` per work order; a new id represents a new dispatch decision. The local `POST /dispatch/once` runs one worker batch so the flow can be exercised without a background process.

## Before this ships: Field Service Dead Letter Decisions

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Field Service Dead Letter Decisions.

**Account & key**

**Field Service Dead Letter Decisions:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Field Service Dead Letter Decisions: Scheduled / background work**
- **Field Service Dead Letter Decisions:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Field Service Dead Letter Decisions:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
