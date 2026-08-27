import { Redis } from "ioredis";
import { config } from "./config";

// maxRetriesPerRequest: null is REQUIRED by BullMQ — it blocks on Redis
// instead of erroring out mid-job if a command is briefly delayed.
export const connection = config.REDIS_URL
  ? new Redis(config.REDIS_URL, { maxRetriesPerRequest: null })
  : new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      maxRetriesPerRequest: null,
    });
