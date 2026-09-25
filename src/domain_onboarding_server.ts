import express from 'express';
import { z } from 'zod';
import { onboardBuyerDomain, completeVerifiedOrder } from './domain_handoff.js';
import { saveSellerAsset, getDomainOrder } from './marketplace_store.js';
import { verifyWebhookSignature } from './webhook_signature.js';
import { InfraiError } from './infrai.js';

const app = express();
app.use('/webhooks/domain-verifications', express.text({ type: '*/*' }));
app.use(express.json());

const sellerAssetSchema = z.object({
  sellerId: z.string().min(1),
  assetId: z.string().min(1),
  host: z.string().min(1)
});

const domainOnboardingSchema = z.object({
  sellerId: z.string().min(1),
  assetId: z.string().min(1),
  buyerDomain: z.string().min(1),
  vendor: z.string().min(1).optional()
});

const verificationWebhookSchema = z.object({
  orderId: z.string().min(1),
  domain: z.string().min(1),
  status: z.literal('verified')
});

app.post('/seller-assets', (req, res) => {
  const parsed = sellerAssetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const saved = saveSellerAsset(parsed.data);
  return res.status(201).json(saved);
});

app.post('/orders/:orderId/domain-onboarding', async (req, res) => {
  const parsed = domainOnboardingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const order = await onboardBuyerDomain({
      orderId: req.params.orderId,
      ...parsed.data
    });

    return res.status(201).json({
      orderId: order.orderId,
      status: order.status,
      buyerDomain: order.buyerDomain,
      hostedTarget: order.hostedTarget,
      dnsInstruction: order.dnsInstruction
    });
  } catch (error) {
    if (error instanceof InfraiError) {
      return res.status(error.status >= 400 && error.status < 500 ? error.status : 502).json({
        error: {
          code: error.code,
          message: error.message
        }
      });
    }

    return res.status(400).json({
      error: {
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
});

app.post('/webhooks/domain-verifications', (req, res) => {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    return res.status(500).json({ error: { message: 'WEBHOOK_SECRET is required' } });
  }

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const signature = req.header('x-webhook-signature') ?? '';
  const validSignature = verifyWebhookSignature({
    secret,
    rawBody,
    signature
  });

  if (!validSignature) {
    return res.status(401).json({ error: { message: 'Invalid signature' } });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return res.status(400).json({ error: { message: 'Invalid JSON' } });
  }
  const parsed = verificationWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const order = completeVerifiedOrder({
    orderId: parsed.data.orderId,
    domain: parsed.data.domain
  });

  return res.status(200).json({
    order,
    current: order ? getDomainOrder(order.orderId) : undefined
  });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`domain onboarding server listening on http://localhost:${port}`);
});
