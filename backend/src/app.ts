import express from "express";
import cors from "cors";
import net from "net";
import { router } from "./routes/campaigns";

export const app = express();
app.use(cors());
// 100kb default is too tight for a recipient list + base64 attachments
app.use(express.json({ limit: "15mb" }));
app.get("/health", (_req, res) => res.json({ ok: true }));

// Raw TCP reachability to Ethereal, bypassing SMTP/auth — lets anyone verify
// the outbound-SMTP block documented in the README's "Live deployment" section.
app.get("/debug/smtp-check", async (_req, res) => {
  const check = (port: number) =>
    new Promise<string>((resolve) => {
      const socket = net.createConnection({ host: "smtp.ethereal.email", port, timeout: 5000 });
      socket.on("connect", () => {
        socket.destroy();
        resolve("OK");
      });
      socket.on("timeout", () => {
        socket.destroy();
        resolve("TIMEOUT");
      });
      socket.on("error", (err) => resolve(`ERROR: ${err.message}`));
    });

  const [port465, port587] = await Promise.all([check(465), check(587)]);
  res.json({ port465, port587 });
});

app.use("/api", router);

// One bad request shouldn't take down every other in-flight one
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("API error:", err);
  res.status(503).json({ error: "Temporarily unavailable — please retry." });
});
