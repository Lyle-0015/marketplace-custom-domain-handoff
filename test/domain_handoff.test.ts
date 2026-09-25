import { describe, expect, it } from 'vitest';
import { saveSellerAsset, saveDomainOrder, getDomainOrder } from '../src/marketplace_store.js';
import { completeVerifiedOrder } from '../src/domain_handoff.js';
import { signWebhookBody, verifyWebhookSignature } from '../src/webhook_signature.js';

describe('domain handoff', () => {
  it('moves an order to ready_for_handoff after a verified callback', () => {
    saveSellerAsset({
      sellerId: 'seller_123',
      assetId: 'asset_ginger_shop',
      host: 'shops.marketplace.test'
    });

    saveDomainOrder({
      orderId: 'order_900',
      sellerId: 'seller_123',
      assetId: 'asset_ginger_shop',
      buyerDomain: 'shop.buyer-example.com',
      zoneId: 'zone_123',
      status: 'awaiting_dns',
      hostedTarget: 'shops.marketplace.test',
      dnsInstruction: {
        recordType: 'TXT',
        name: '_verify.shop.buyer-example.com',
        content: 'verify-token',
        ttl: 300
      }
    });

    const rawBody = JSON.stringify({
      orderId: 'order_900',
      domain: 'shop.buyer-example.com',
      status: 'verified'
    });
    const signature = signWebhookBody('dev_webhook_secret', rawBody);

    expect(
      verifyWebhookSignature({
        secret: 'dev_webhook_secret',
        rawBody,
        signature
      })
    ).toBe(true);

    const updated = completeVerifiedOrder({
      orderId: 'order_900',
      domain: 'shop.buyer-example.com'
    });

    expect(updated?.status).toBe('ready_for_handoff');
    expect(getDomainOrder('order_900')?.status).toBe('ready_for_handoff');
  });

  it('does not update an order for a different domain', () => {
    saveDomainOrder({
      orderId: 'order_mismatch',
      sellerId: 'seller_123',
      assetId: 'asset_ginger_shop',
      buyerDomain: 'shop.buyer-example.com',
      zoneId: 'zone_123',
      status: 'awaiting_dns',
      hostedTarget: 'shops.marketplace.test',
      dnsInstruction: {
        recordType: 'TXT',
        name: '_verify.shop.buyer-example.com',
        content: 'verify-token'
      }
    });

    expect(completeVerifiedOrder({ orderId: 'order_mismatch', domain: 'other.example.com' })).toBeUndefined();
    expect(getDomainOrder('order_mismatch')?.status).toBe('awaiting_dns');
  });
});
