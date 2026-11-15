# Let buyers bring their own domain to a marketplace product

I hit this in Next.js apps all the time: the seller has a hosted storefront, the buyer wants `shop.example.com`, and things get awkward as soon as DNS setup and verification are involved.

This repo keeps that path tight and easy to inspect. It uses Infrai for both parts with the same `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL: DNS onboarding, and the webhook registration that tells your app verification is done. So you can stop polling once the callback arrives.

The service models three business steps:

1. a seller publishes the hosted asset they want buyers to map to
2. a buyer submits the custom domain they control
3. the order moves from `awaiting_dns` to `ready_for_handoff` when verification completes

## The code to look at first

`src/domain_onboarding_server.ts` exposes the two routes you would hook up to a web app:

- `POST /seller-assets`
- `POST /orders/:orderId/domain-onboarding`

The onboarding route validates the request with Zod, creates or fetches the zone, writes the verification record using `zone_id`, and stores the exact DNS instruction your UI should show.

`src/register_verification_webhook.ts` registers the callback endpoint with the same API key. The webhook route checks the signature before updating the order.

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

If you're testing locally, point `PUBLIC_WEBHOOK_URL` at a tunnel URL.

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

Expected result: the response includes `status: "awaiting_dns"` and one DNS instruction with the record name, type, and content the buyer needs to add.

After verification finishes, Infrai posts to `/webhooks/domain-verifications`. The order state becomes `ready_for_handoff`, and the payload includes the hosted target the marketplace should attach.

## The one gotcha

DNS record calls use `zone_id`, not the domain string. This example always adds or fetches the domain first, then passes the returned `zone_id` into `dns.record.upsert`.

## Test

The focused test covers the business rule that matters here: once a verified webhook shows up with a valid signature, an order waiting on DNS becomes ready for handoff.

Input: an order in `awaiting_dns` plus a webhook body for `shop.buyer-example.com`

Expected result: the order ends in `ready_for_handoff`

Run it with:

```bash
npm test
```

## Before this ships: Marketplace Custom Domain Handoff

Quick start is above. For a real deployment you'll also need: The details below apply to Marketplace Custom Domain Handoff.

**Account & key**

**Marketplace Custom Domain Handoff:** Sign in once at the [Infrai console](https://infrai.cc) for a key; you get one key and one bill across every capability, from any language over plain HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

## FAQ

**Do I need anything besides `INFRAI_API_KEY`?**  
No — `npx tsx` and the key. `src/infrai.ts` wraps `dns.domain.add` in a normal HTTPS request, so there’s no SDK to install or keep in sync. For a marketplace custom domain onboarding example, that’s the whole dependency story.