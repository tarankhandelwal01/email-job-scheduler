import { app } from "./app";
import { config } from "./config";
import { runStartupChecks } from "./startupChecks";

// Belt-and-suspenders: asyncHandler (routes/campaigns.ts) catches route-level
// rejections, but this covers anything outside a request — e.g. a stray
// rejection during startup — so the process logs and survives instead of
// dying silently.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

runStartupChecks("API").then(() => {
  app.listen(config.PORT, () => {
    console.log(`API listening on http://localhost:${config.PORT}`);
  });
});
