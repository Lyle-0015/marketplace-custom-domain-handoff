import { infrai } from './infrai.js';
import {
  getSellerAsset,
  getDomainOrder,
  markOrderReadyForHandoff,
  saveDomainOrder,
  type DomainOrder
} from './marketplace_store.js';

export async function onboardBuyerDomain(input: {
  orderId: string;
  sellerId: string;
  assetId: string;
  buyerDomain: string;
  vendor?: string;
}): Promise<DomainOrder> {
  const asset = getSellerAsset(input.sellerId, input.assetId);
  if (!asset) {
    throw new Error('Seller asset not found');
  }

  const added = await infrai.dns.domain.add({
    domain: input.buyerDomain,
    vendor: input.vendor,
    metadata: {
      order_id: input.orderId,
      seller_id: input.sellerId,
      asset_id: input.assetId
    }
  });

  const zone = added.zone_id ? added : await infrai.dns.domain.get({ domain: input.buyerDomain });

  const verification = await infrai.dns.domain.verify({
    domain: input.buyerDomain
  });

  const instruction = {
    recordType: (verification.verification?.record_type ?? added.verification?.record_type ?? 'TXT') as
      | 'TXT'
      | 'CNAME'
      | 'MX'
      | 'A',
    name: verification.verification?.name ?? added.verification?.name ?? input.buyerDomain,
    content: verification.verification?.content ?? added.verification?.content ?? asset.host,
    ttl: verification.verification?.ttl ?? added.verification?.ttl ?? 300
  };

  await infrai.dns.record.upsert({
    zone_id: zone.zone_id,
    record_type: instruction.recordType,
    name: instruction.name,
    content: instruction.content,
    ttl: instruction.ttl,
    metadata: {
      order_id: input.orderId,
      hosted_target: asset.host
    }
  });

  return saveDomainOrder({
    orderId: input.orderId,
    sellerId: input.sellerId,
    assetId: input.assetId,
    buyerDomain: input.buyerDomain,
    zoneId: zone.zone_id,
    status: 'awaiting_dns',
    hostedTarget: asset.host,
    dnsInstruction: instruction
  });
}

export function completeVerifiedOrder(input: { orderId: string; domain: string }) {
  const order = getDomainOrder(input.orderId);
  if (!order || order.buyerDomain !== input.domain) {
    return undefined;
  }

  return markOrderReadyForHandoff(input.orderId);
}
