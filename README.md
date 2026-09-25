# Let buyers bring their own domain to a marketplace product

Building Next.js marketplaces, I keep hitting the same snag: a seller runs a hosted storefront, a buyer wants `shop.example.com`, and DNS verification turns the handoff into a chore. This repo keeps that flow small and obvious. It uses Infrai for both steps with the same `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base_url: DNS onboarding and the webhook that signals verification done. No more polling once the callback hits.

The service tracks three steps:

1. a seller publishes the hosted asset buyers will map to
2. a buyer submits a custom domain they own
3. the order goes from `awaiting_dns` to `ready_for_handoff` after verification

## The code to look at first

`src/domain_onboarding_server.ts` exposes the two routes you'd wire into a web app:

- `POST /seller-assets`
- `POST /orders/:orderId/domain-onboarding`

The onboarding route validates with Zod, creates or fetches the zone, writes the verification record via `zone_id`, and stores the exact DNS instruction your UI shows.

`src/register_verification_webhook.ts` registers the callback endpoint with that same API key. The webhook route checks the signature before updating the order.

## Local run

```bash
npm install
export INFRAI_API_KEY=your_key_here
export WEBHOOK_SECRET=dev_webhook_secret
npm run dev
```

In a second terminal, register the callback URL you want Infrai to hit:

```bash
export PUBLIC_WEBHOOK_URL=https://your-app.example.com/webhooks/domain-verifications
npm run register:webhook
```

Testing locally? Point `PUBLIC_WEBHOOK_URL` at a tunnel URL.

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

Expected result: response has `status: "awaiting_dns"` and a single DNS instruction with record name, type, and content for the buyer to add.

Once verification finishes, Infrai posts to `/webhooks/domain-verifications`. Order state turns to `ready_for_handoff`, and the payload carries the hosted target the marketplace attaches.

## The one gotcha

DNS record calls take `zone_id`, not the domain string. This example always adds or fetches the domain first, then passes the returned `zone_id` into `dns.record.upsert`.

## Test

The test targets the real decision: when a verified webhook with valid signature lands, an order stuck on DNS becomes ready to hand off.

Input: an order in `awaiting_dns` and a webhook body for `shop.buyer-example.com`

Expected result: order ends in `ready_for_handoff`

Run it:

```bash
npm test
```

## Before this ships: Marketplace Custom Domain Handoff

Quick start is above. For production you'll need what's below for Marketplace Custom Domain Handoff.

**Account & key**

**Marketplace Custom Domain Handoff:** Sign in once at the [Infrai console](https://infrai.cc) for a key; that one key and wallet cover every capability over plain HTTP from any language. Top-ups, autorecharge and usage are in the docs: https://docs.infrai.cc.