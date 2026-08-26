import express from "express";
import cors from "cors";
import { router } from "./routes/campaigns";

export const app = express();
app.use(cors());
// Default express.json() limit (100kb) is too tight for a large recipient
// list plus base64 attachments; the recipient cap and attachment cap
// (scheduler.ts, campaigns.ts) are the real guards against a runaway request.
app.use(express.json({ limit: "15mb" }));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api", router);

// Any error forwarded via asyncHandler lands here instead of crashing the
// process — one bad request shouldn't take down every other in-flight one.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("API error:", err);
  res.status(503).json({ error: "Temporarily unavailable — please retry." });
});
