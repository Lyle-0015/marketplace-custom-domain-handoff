export type SellerAsset = {
  sellerId: string;
  assetId: string;
  host: string;
};

export type DomainInstruction = {
  recordType: 'TXT' | 'CNAME' | 'MX' | 'A';
  name: string;
  content: string;
  ttl?: number;
};

export type DomainOrderStatus = 'awaiting_dns' | 'ready_for_handoff';

export type DomainOrder = {
  orderId: string;
  sellerId: string;
  assetId: string;
  buyerDomain: string;
  zoneId: string;
  status: DomainOrderStatus;
  hostedTarget: string;
  dnsInstruction: DomainInstruction;
};

const sellerAssets = new Map<string, SellerAsset>();
const domainOrders = new Map<string, DomainOrder>();

function sellerAssetKey(sellerId: string, assetId: string): string {
  return `${sellerId}:${assetId}`;
}

export function saveSellerAsset(asset: SellerAsset): SellerAsset {
  sellerAssets.set(sellerAssetKey(asset.sellerId, asset.assetId), asset);
  return asset;
}

export function getSellerAsset(sellerId: string, assetId: string): SellerAsset | undefined {
  return sellerAssets.get(sellerAssetKey(sellerId, assetId));
}

export function saveDomainOrder(order: DomainOrder): DomainOrder {
  domainOrders.set(order.orderId, order);
  return order;
}

export function getDomainOrder(orderId: string): DomainOrder | undefined {
  return domainOrders.get(orderId);
}

export function markOrderReadyForHandoff(orderId: string): DomainOrder | undefined {
  const order = domainOrders.get(orderId);
  if (!order) {
    return undefined;
  }

  const updated: DomainOrder = {
    ...order,
    status: 'ready_for_handoff'
  };
  domainOrders.set(orderId, updated);
  return updated;
}
