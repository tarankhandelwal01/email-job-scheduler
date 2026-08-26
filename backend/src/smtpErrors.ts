/** 5xx SMTP responses are permanent (bad mailbox, blocked domain). Never retry those. */
export function isPermanent(err: any): boolean {
  const code = err?.responseCode ?? err?.code;
  if (typeof code === "number") return code >= 500 && code < 600;
  return ["EENVELOPE", "EMESSAGE"].includes(String(code));
}
