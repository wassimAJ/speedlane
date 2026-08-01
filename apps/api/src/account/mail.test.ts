import { describe, expect, it, vi } from "vitest";

import {
  ResendVerificationMailDelivery,
  UnavailableVerificationMailDelivery,
  VerificationMailDeliveryError,
} from "./mail.js";

describe("ResendVerificationMailDelivery", () => {
  it("sends branded non-demo verification content through the injected client", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "email-id" }, error: null });
    const delivery = new ResendVerificationMailDelivery(
      { emails: { send } },
      "Amazon 2.0 <accounts@example.com>",
    );

    expect(delivery.available).toBe(true);

    await delivery.sendVerificationCode({
      to: "reader@example.com",
      code: "123456",
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Amazon 2.0 <accounts@example.com>",
        to: "reader@example.com",
        subject: "Your Amazon 2.0 verification code",
        text: expect.stringContaining("123456"),
        html: expect.stringContaining("123456"),
      }),
    );
    expect(JSON.stringify(send.mock.calls)).not.toContain("ReaderDemo123");
  });

  it("maps provider failures to a controlled delivery error", async () => {
    const delivery = new ResendVerificationMailDelivery(
      {
        emails: {
          send: vi.fn().mockResolvedValue({
            data: null,
            error: { name: "validation_error", message: "provider detail" },
          }),
        },
      },
      "accounts@example.com",
    );

    await expect(
      delivery.sendVerificationCode({ to: "reader@example.com", code: "123456" }),
    ).rejects.toBeInstanceOf(VerificationMailDeliveryError);
  });

  it("marks the unconfigured adapter unavailable without provider access", async () => {
    const delivery = new UnavailableVerificationMailDelivery();

    expect(delivery.available).toBe(false);
    await expect(
      delivery.sendVerificationCode({ to: "reader@example.com", code: "123456" }),
    ).rejects.toBeInstanceOf(VerificationMailDeliveryError);
  });
});
