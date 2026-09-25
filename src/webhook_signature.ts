import { createHmac, timingSafeEqual } from 'node:crypto';

export function signWebhookBody(secret: string, rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verifyWebhookSignature(input: {
  secret: string;
  rawBody: string;
  signature: string;
}): boolean {
  const expected = signWebhookBody(input.secret, input.rawBody);
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
