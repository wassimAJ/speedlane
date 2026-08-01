import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

const TOKEN_ISSUER = "amazon-2-api";
const TOKEN_AUDIENCE = "amazon-2-web";

const tokenHeaderSchema = z
  .object({
    alg: z.literal("HS256"),
    typ: z.literal("JWT"),
  })
  .strict();

const tokenPayloadSchema = z
  .object({
    sub: z.string().uuid(),
    iss: z.literal(TOKEN_ISSUER),
    aud: z.literal(TOKEN_AUDIENCE),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
  })
  .strict();

export interface TokenConfig {
  secret: string;
  ttlSeconds: number;
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sign(unsignedToken: string, secret: string) {
  return createHmac("sha256", secret).update(unsignedToken).digest();
}

function decodeJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function isCanonicalBase64Url(value: string) {
  return (
    value.length > 0 &&
    /^[\w-]+$/u.test(value) &&
    Buffer.from(value, "base64url").toString("base64url") === value
  );
}

export function createSessionToken(
  userId: string,
  config: TokenConfig,
  now = new Date(),
) {
  const issuedAt = Math.floor(now.getTime() / 1_000);
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    sub: userId,
    iss: TOKEN_ISSUER,
    aud: TOKEN_AUDIENCE,
    iat: issuedAt,
    exp: issuedAt + config.ttlSeconds,
  });
  const unsignedToken = `${header}.${payload}`;
  const signature = sign(unsignedToken, config.secret).toString("base64url");

  return `${unsignedToken}.${signature}`;
}

export function verifySessionToken(
  token: string,
  config: TokenConfig,
  now = new Date(),
): string | null {
  const segments = token.split(".");

  if (segments.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments;

  if (
    encodedHeader === undefined ||
    encodedPayload === undefined ||
    encodedSignature === undefined ||
    !isCanonicalBase64Url(encodedHeader) ||
    !isCanonicalBase64Url(encodedPayload) ||
    !isCanonicalBase64Url(encodedSignature)
  ) {
    return null;
  }

  try {
    const header = tokenHeaderSchema.safeParse(decodeJson(encodedHeader));
    const payload = tokenPayloadSchema.safeParse(decodeJson(encodedPayload));

    if (!header.success || !payload.success) {
      return null;
    }

    const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`, config.secret);
    const actualSignature = Buffer.from(encodedSignature, "base64url");

    if (
      expectedSignature.length !== actualSignature.length ||
      !timingSafeEqual(expectedSignature, actualSignature)
    ) {
      return null;
    }

    const currentTime = Math.floor(now.getTime() / 1_000);

    if (
      payload.data.exp <= currentTime ||
      payload.data.iat > currentTime + 60 ||
      payload.data.exp <= payload.data.iat
    ) {
      return null;
    }

    return payload.data.sub;
  } catch {
    return null;
  }
}
