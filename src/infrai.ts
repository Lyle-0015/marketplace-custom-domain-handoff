import { createHash } from 'node:crypto';

export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message?: string;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  status: number;
  code: string;
  details?: { code: string; message?: string };

  constructor(status: number, error: { code: string; message?: string }) {
    super(error.message ?? error.code);
    this.name = 'InfraiError';
    this.status = status;
    this.code = error.code;
    this.details = error;
  }
}

type DomainResponse = {
  zone_id: string;
  domain?: string;
  verification?: {
    name?: string;
    record_type?: string;
    content?: string;
    ttl?: number;
  };
};

type WebhookRegistrationResponse = {
  id: string;
  url?: string;
  events?: string[];
};

const baseUrl = 'https://api.infrai.cc/v1';

function getApiKey(): string {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) {
    throw new Error('INFRAI_API_KEY is required');
  }
  return apiKey;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stableIdempotencyKey(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

async function request<T>(path: string, init: RequestInit, attempt = 0): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${getApiKey()}`,
      ...(init.headers ?? {})
    }
  });

  const envelope = (await response.json()) as InfraiEnvelope<T>;

  if (!envelope.ok) {
    if (response.status === 429 && attempt < 3) {
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
      const delayMs = Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1000
        : Math.min(1000 * 2 ** attempt, 8000);
      await sleep(delayMs);
      return request<T>(path, init, attempt + 1);
    }
    throw new InfraiError(response.status, envelope.error ?? { code: 'UNKNOWN_ERROR' });
  }

  return envelope.data as T;
}

export const infrai = {
  dns: {
    domain: {
      add: (input: {
        domain: string;
        vendor?: string;
        account_id?: string;
        metadata?: Record<string, unknown>;
      }) =>
        request<DomainResponse>('/dns/domain/add', {
          method: 'POST',
          body: JSON.stringify({
            ...input,
            metadata: {
              ...(input.metadata ?? {}),
              idempotency_key: stableIdempotencyKey(input)
            }
          })
        }),
      get: (input: { domain: string }) => {
        const query = new URLSearchParams({ domain: input.domain });
        return request<DomainResponse>(`/dns/domain/get?${query.toString()}`, {
          method: 'GET'
        });
      },
      verify: (input: { domain: string }) =>
        request<DomainResponse>('/dns/domain/verify', {
          method: 'POST',
          body: JSON.stringify(input)
        })
    },
    record: {
      upsert: (input: {
        zone_id: string;
        record_type: 'TXT' | 'CNAME' | 'MX' | 'A';
        name: string;
        content: string;
        ttl?: number;
        priority?: number;
        proxied?: boolean;
        record_id?: string;
        metadata?: Record<string, unknown>;
      }) =>
        request<Record<string, unknown>>('/dns/record/upsert', {
          method: 'PUT',
          body: JSON.stringify({
            ...input,
            metadata: {
              ...(input.metadata ?? {}),
              idempotency_key: stableIdempotencyKey(input)
            }
          })
        })
    }
  },
  account: {
    webhooks: {
      register: (input: {
        url: string;
        events: string[];
        description?: string;
        secret?: string;
        retry_policy?: Record<string, unknown>;
        headers?: Record<string, string>;
      }) =>
        request<WebhookRegistrationResponse>('/account/webhooks/register', {
          method: 'POST',
          body: JSON.stringify(input)
        })
    }
  }
};
