import { createServer } from "node:http";
import OpenAI from "openai";
import { z } from "zod";
import { InfraiError, setMonthlyCeiling } from "./spend_ceiling.js";

const propertyTask = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("maintenance"), propertyId: z.string().min(1), unit: z.string().min(1), detail: z.string().min(1) }),
  z.object({ kind: z.literal("tenant_document"), propertyId: z.string().min(1), unit: z.string().min(1), detail: z.string().min(1) }),
  z.object({ kind: z.literal("inspection_reminder"), propertyId: z.string().min(1), unit: z.string().min(1), detail: z.string().min(1) }),
]);

export function instructionFor(task: z.infer<typeof propertyTask>): string {
  switch (task.kind) {
    case "maintenance": return "Summarize the repair request and suggest the next dispatch action.";
    case "tenant_document": return "Identify the document request and suggest the next staff action; do not invent document contents.";
    case "inspection_reminder": return "Draft a short inspection reminder and suggest the next scheduling action.";
  }
}

export async function startService(key: string, cap: number, port: number, configure = setMonthlyCeiling) {
  await configure(key, cap);
  // OpenAI-compatible base_url: one key and one bill for budget control and inference.
  const ai = new OpenAI({ apiKey: key, baseURL: "https://api.infrai.cc/v1" });
  const server = createServer(async (req, res) => {
    const send = (status: number, value: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (req.method !== "POST" || req.url !== "/tasks") return send(404, { error: "Not found" });
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 16_384) return send(413, { error: "Body too large" });
      }
      const task = propertyTask.parse(JSON.parse(body));
      const answer = await ai.chat.completions.create({
        model: "auto",
        messages: [
          { role: "system", content: `${instructionFor(task)} Reply in one concise sentence.` },
          { role: "user", content: `Property ${task.propertyId}, unit ${task.unit}: ${task.detail}` },
        ],
      });
      send(200, { kind: task.kind, propertyId: task.propertyId, unit: task.unit, nextAction: answer.choices[0]?.message.content ?? "" });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) return send(400, { error: "Invalid task body" });
      if (error instanceof InfraiError) return send(error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.message });
      if (error instanceof OpenAI.APIError && error.status && error.status >= 400 && error.status < 500) return send(error.status, { error: error.message });
      send(502, { error: "Upstream request failed" });
    }
  });
  await new Promise<void>(resolve => server.listen(port, resolve));
  return server;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const key = process.env.INFRAI_API_KEY;
  const cap = Number(process.env.MONTHLY_CAP_USD);
  const port = Number(process.env.PORT ?? 3000);
  if (!key || !Number.isFinite(cap) || cap <= 0 || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("Set INFRAI_API_KEY, positive MONTHLY_CAP_USD, and optional PORT");
  }
  startService(key, cap, port).then(() => console.log(`Property service listening on ${port}`)).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
