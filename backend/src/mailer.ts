import nodemailer, { Transporter } from "nodemailer";
import { config } from "./config";

// One SMTP transport per Ethereal account. Trimmed defensively — clipboard
// round-trips can add invisible whitespace that breaks auth silently.
const transports = new Map<string, Transporter>();
for (const s of config.ETHEREAL_SENDERS) {
  const user = s.user.trim();
  const pass = s.pass.trim();
  transports.set(
    user,
    nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 465,
      secure: true,
      auth: { user, pass },
    })
  );
}

export const senderEmails = config.ETHEREAL_SENDERS.map((s) => s.user.trim());

export async function sendEmail(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
  attachments?: { filename: string; contentType: string; contentBase64: string }[];
}): Promise<{ messageId: string; previewUrl: string | null }> {
  const transport = transports.get(params.from);
  if (!transport) throw new Error(`No transport configured for sender ${params.from}`);

  const info = await transport.sendMail({
    from: params.from,
    to: params.to,
    subject: params.subject,
    text: params.body,
    html: `<p>${params.body.replace(/\n/g, "<br/>")}</p>`,
    attachments: params.attachments?.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      content: Buffer.from(a.contentBase64, "base64"),
    })),
  });

  return {
    messageId: info.messageId,
    previewUrl: nodemailer.getTestMessageUrl(info) || null,
  };
}
