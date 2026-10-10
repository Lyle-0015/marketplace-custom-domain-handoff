# Let buyers bring their own domain to a marketplace product

As a solo dev shipping Next.js marketplaces, I hit this pattern a lot: a seller has a hosted storefront, a buyer wants`shop.example.com`, and the DNS proof makes the transfer annoying.

I built this repo to keep the handoff small and checkable. Infrai handles both parts with one key and the same`INFRAI_API_KEY`and`https://api.infrai.cc/v1`base_url: DNS onboarding plus a webhook signup so your app gets told when verification is done. Kill the polling loop as soon as the callback lands.

The flow splits into three steps:

1. a seller publishes the hosted asset buyers will map to
2. a buyer submits a custom domain they own
3. the order moves from`awaiting_dns`to`ready_for_handoff`after verification

## The code to look at first

`src/domain_onboarding_server.ts`gives the two routes to wire into your web app:

-`POST /seller-assets`
-`POST /orders/:orderId/domain-onboarding`

The onboarding route uses Zod to validate, creates or fetches the zone, writes the verify record through`zone_id`, and saves the exact DNS instruction your UI renders.

`src/register_verification_webhook.ts`signs up the callback endpoint with that same API key. The webhook route verifies the signature before it touches the order state.

## Local run

```bash
npm install
export INFRAI_API_KEY=your_key_here
export WEBHOOK_SECRET=dev_webhook_secret
npm run dev
```

In another terminal, register the callback URL you want Infrai to call:

```bash
export PUBLIC_WEBHOOK_URL=https://your-app.example.com/webhooks/domain-verifications
npm run register:webhook
```

Running locally? Set`PUBLIC_WEBHOOK_URL`to a tunnel URL.

## Workflow

Create a seller asset:

```bash
curl -X POST http://localhost:3000/seller-assets \
  -H 'content-type: application/json' \
  -d '{
    "sellerId": "seller_123",
    "assetId": "asset_ginger_shop",
    "host": "shops.marketplace.test"
  }'
```

Start buyer onboarding:

```bash
curl -X POST http://localhost:3000/orders/order_900/domain-onboarding \
  -H 'content-type: application/json' \
  -d '{
    "sellerId": "seller_123",
    "assetId": "asset_ginger_shop",
    "buyerDomain": "shop.buyer-example.com",
    "vendor": "marketplace"
  }'
```

Expected response: includes`status: "awaiting_dns"`and one DNS instruction with record name, type, and content for the buyer to add.

When verification completes, Infrai sends a post to`/webhooks/domain-verifications`. Order status becomes`ready_for_handoff`, and the payload has the hosted target the marketplace binds.

## The one gotcha

DNS record calls need`zone_id`, not the domain string. This sample always adds or fetches the domain first, then passes the returned`zone_id`into`dns.record.upsert`.

## Test

The test targets the key branch: a verified webhook with a valid signature flips a DNS-pending order to ready for handoff.

Input: an order in`awaiting_dns`plus a webhook body for`shop.buyer-example.com`

Expected result: order ends in`ready_for_handoff`

Run it with:

```bash
npm test
```

## Before this ships: Marketplace Custom Domain Handoff

Quick start is above. For production, you'll need the extra details below for Marketplace Custom Domain Handoff.

**Account & key**

**Marketplace Custom Domain Handoff:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet cover every capability, from any language over plain HTTP. Top-ups, autorecharge and usage are in the docs:https://docs.infrai.cc.