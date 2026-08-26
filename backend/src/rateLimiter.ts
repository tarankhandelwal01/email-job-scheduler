import { connection } from "./redis";
import { config } from "./config";

// Atomic check-and-increment — a separate GET then INCR would let two
// workers both read 199 and both send.
const ACQUIRE_LUA = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current >= tonumber(ARGV[1]) then
  return -1
end
local updated = redis.call('INCR', KEYS[1])
if updated == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
return updated
`;

connection.defineCommand("acquireToken", { numberOfKeys: 1, lua: ACQUIRE_LUA });

/** UTC hour bucket, e.g. "2026-08-26T14" */
export function hourWindow(d = new Date()): string {
  return d.toISOString().slice(0, 13);
}

export function nextHourBoundary(): number {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  return d.getTime() + 3_600_000;
}

const key = (sender: string) => `email-rate:${sender}:${hourWindow()}`;

// campaignLimit can only tighten the cap, never loosen it past the
// env-configured ceiling.
export async function acquire(sender: string, campaignLimit?: number): Promise<boolean> {
  const effectiveLimit =
    campaignLimit && campaignLimit > 0
      ? Math.min(campaignLimit, config.MAX_EMAILS_PER_HOUR_PER_SENDER)
      : config.MAX_EMAILS_PER_HOUR_PER_SENDER;

  const result = await (connection as any).acquireToken(key(sender), effectiveLimit, 7200);
  return result !== -1;
}

export async function release(sender: string): Promise<void> {
  const k = key(sender);
  const v = await connection.get(k);
  if (v && Number(v) > 0) await connection.decr(k);
}

/** First sender with hourly capacity left; null if all are capped this hour. */
export async function pickAvailableSender(senders: string[], campaignLimit?: number): Promise<string | null> {
  for (const s of senders) {
    if (await acquire(s, campaignLimit)) return s;
  }
  return null;
}
