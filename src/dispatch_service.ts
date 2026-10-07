import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { dispatchDecision, workOrder } from "./dispatch_decision.ts";
import { infrai, InfraiError } from "./infrai_queue.ts";

function send(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

async function readBody(req: AsyncIterable<Uint8Array>): Promise<unknown> {
  let text = "";
  for await (const chunk of req) {
    text += chunk.toString();
    if (text.length > 64_000) throw new Error("Request body too large");
  }
  return JSON.parse(text);
}

createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/work-orders") {
      const order = workOrder.parse(await readBody(req));
      const result = await infrai.queue.publish(order, order.orderId);
      return send(res, 202, { orderId: order.orderId, messageId: result.message_id, status: "queued" });
    }
    if (req.method === "POST" && req.url === "/dispatch/once") {
      const batch = await infrai.queue.consume();
      const completed: string[] = [];
      const pending: string[] = [];
      for (const message of batch.items) {
        const order = workOrder.parse(message.payload);
        if (dispatchDecision(order) === "complete") {
          await infrai.queue.ack(message.message_id);
          completed.push(order.orderId);
        } else pending.push(order.orderId);
      }
      return send(res, 200, { completed, pending });
    }
    if (req.method === "GET" && req.url === "/technician-follow-ups") {
      const result = await infrai.queue.dlq.list();
      return send(res, 200, { items: result.items.map(item => ({
        messageId: item.message_id, order: workOrder.parse(item.payload)
      })) });
    }
    send(res, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return send(res, 400, { error: "Invalid work order" });
    if (error instanceof InfraiError) return send(res, error.status >= 400 && error.status < 500 ? error.status : 502, {
      error: error.code, detail: error.message
    });
    send(res, 502, { error: error instanceof Error ? error.message : "Request failed" });
  }
}).listen(Number(process.env.PORT ?? 3000), () => console.log("Dispatch service listening"));
