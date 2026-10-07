import { z } from "zod";

export const workOrder = z.object({
  orderId: z.string().min(1),
  photos: z.array(z.object({ photoId: z.string().min(1), url: z.string().url() })).min(1),
  dispatchStatus: z.enum(["assigned", "blocked"]),
  technicianId: z.string().min(1),
  followUp: z.string().min(1)
}).strict();

export type WorkOrder = z.infer<typeof workOrder>;

export function dispatchDecision(order: WorkOrder): "complete" | "retry" {
  return order.dispatchStatus === "assigned" ? "complete" : "retry";
}
