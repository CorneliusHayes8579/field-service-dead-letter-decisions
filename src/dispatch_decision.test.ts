import assert from "node:assert/strict";
import { test } from "node:test";
import { dispatchDecision, workOrder } from "./dispatch_decision.ts";

test("blocked dispatch remains unacknowledged for technician follow-up", () => {
  const base = { orderId: "wo-17", technicianId: "tech-2", followUp: "Call resident", photos: [
    { photoId: "before-1", url: "https://example.org/photos/before-1.jpg" }
  ] };
  assert.equal(dispatchDecision(workOrder.parse({ ...base, dispatchStatus: "blocked" })), "retry");
  assert.equal(dispatchDecision(workOrder.parse({ ...base, dispatchStatus: "assigned" })), "complete");
  assert.throws(() => workOrder.parse({ ...base, photos: [] }));
});
