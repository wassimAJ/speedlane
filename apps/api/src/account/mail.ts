import { Resend, type CreateEmailOptions, type CreateEmailResponse } from "resend";

export interface VerificationMailMessage {
  to: string;
  code: string;
}

export interface VerificationMailDelivery {
  readonly available: boolean;
  sendVerificationCode(message: VerificationMailMessage): Promise<void>;
}

interface ResendClient {
  emails: {
    send(payload: CreateEmailOptions): Promise<CreateEmailResponse>;
  };
}

export class VerificationMailDeliveryError extends Error {
  constructor() {
    super("Verification email delivery failed.");
  }
}

function verificationEmailContent(code: string) {
  return {
    subject: "Your Amazon 2.0 verification code",
    text: [
      "Welcome to Amazon 2.0.",
      "",
      `Your verification code is: ${code}`,
      "This code expires in 10 minutes.",
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: [
      "<h1>Amazon 2.0</h1>",
      "<p>Use this verification code to finish creating your account:</p>",
      `<p><strong style=\"font-size: 24px; letter-spacing: 0.2em;\">${code}</strong></p>`,
      "<p>This code expires in 10 minutes.</p>",
      "<p>If you did not request this, you can ignore this email.</p>",
    ].join(""),
  };
}

export class ResendVerificationMailDelivery
  implements VerificationMailDelivery
{
  readonly available = true;

  constructor(
    private readonly client: ResendClient,
    private readonly from: string,
  ) {}

  async sendVerificationCode({ to, code }: VerificationMailMessage) {
    const content = verificationEmailContent(code);

    try {
      const result = await this.client.emails.send({
        from: this.from,
        to,
        ...content,
      });

      if (result.error !== null) {
        throw new VerificationMailDeliveryError();
      }
    } catch {
      throw new VerificationMailDeliveryError();
    }
  }
}

export class UnavailableVerificationMailDelivery
  implements VerificationMailDelivery
{
  readonly available = false;

  async sendVerificationCode() {
    throw new VerificationMailDeliveryError();
  }
}

export function createResendVerificationMailDelivery(
  apiKey: string,
  from: string,
) {
  return new ResendVerificationMailDelivery(new Resend(apiKey), from);
}
