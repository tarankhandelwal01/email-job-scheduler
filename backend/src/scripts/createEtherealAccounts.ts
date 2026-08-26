import nodemailer from "nodemailer";

async function main() {
  const count = Number(process.argv[2] ?? 2);
  const accounts: { user: string; pass: string }[] = [];

  for (let i = 0; i < count; i++) {
    const account = await nodemailer.createTestAccount();
    accounts.push({ user: account.user, pass: account.pass });
  }

  console.log("\nPaste this into backend/.env as ETHEREAL_SENDERS:\n");
  console.log(`ETHEREAL_SENDERS=${JSON.stringify(accounts)}\n`);
}

main().catch((err) => {
  console.error("Failed to create Ethereal test accounts:", err);
  process.exit(1);
});
