import { infrai } from './infrai.js';

async function main() {
  const url = process.env.PUBLIC_WEBHOOK_URL;
  const secret = process.env.WEBHOOK_SECRET;

  if (!url) {
    throw new Error('PUBLIC_WEBHOOK_URL is required');
  }

  if (!secret) {
    throw new Error('WEBHOOK_SECRET is required');
  }

  const webhook = await infrai.account.webhooks.register({
    url,
    events: ['dns.domain.verify'],
    description: 'Marketplace domain verification callback',
    secret,
    headers: {
      'x-app': 'marketplace-custom-domain-handoff'
    }
  });

  console.log(JSON.stringify({ webhook }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
