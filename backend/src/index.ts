import { app } from "./app";
import { config } from "./config";
import { runStartupChecks } from "./startupChecks";

// Catches rejections outside a request (asyncHandler covers in-request ones)
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

runStartupChecks("API").then(() => {
  app.listen(config.PORT, () => {
    console.log(`API listening on http://localhost:${config.PORT}`);
  });
});
