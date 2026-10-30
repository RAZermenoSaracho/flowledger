# Public REST API (`/v1`)

A small, key-authenticated HTTP surface over your own accounts, categories and transactions. Everything not listed here returns `404` (deny by default); there is no `DELETE`.

## Authentication

Create a personal API key in the web app (Settings, API keys). Send it on every request:

```
Authorization: Bearer fl_...
```

Only API keys are accepted. Web-session tokens, revoked, expired or unknown keys get `401`.

| Scope | Allows |
|---|---|
| `read` | all `GET` routes |
| `write` | `POST` and `PUT` (also satisfies `read`) |

A key lacking the scope gets `403` (checked before body validation).

## Endpoints

Base URL: `${PUBLIC_API_URL}/v1`

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/accounts` | read | |
| GET | `/categories` | read | |
| GET | `/transactions` | read | paginated, see below |
| GET | `/transactions/summary` | read | same `query` as the list |
| GET | `/transactions/:id` | read | `404` if not yours |
| POST | `/transactions` | write | `201`, body as in the web API |
| PUT | `/transactions/:id` | write | body as in the web API |

Request bodies and responses are identical to the internal `/transactions`, `/accounts` and `/categories` routes. Another user's ids behave like missing ones (`404`).

## Querying and pagination

List and summary routes take a `query` parameter holding a JSON-encoded expression:

```bash
curl -G "$PUBLIC_API_URL/v1/transactions" \
  -H "Authorization: Bearer $FL_KEY" \
  --data-urlencode 'query={"where":{"field":"type","op":"=","value":"expense"},"pagination":{"kind":"offset","page":2,"pageSize":25}}'
```

`GET /v1/transactions` returns at most 100 rows: with no pagination it returns page 1 of 50; a `pageSize` above 100 is reduced to 100; `pageSize < 1`, non-`offset` pagination or malformed JSON return `400`. `meta` reports the total and page count.

## Create a transaction

```bash
curl -X POST "$PUBLIC_API_URL/v1/transactions" \
  -H "Authorization: Bearer $FL_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Coffee","amount":4.5,"type":"expense","date":"2024-01-15","accountId":"<id>","categoryId":"<id>"}'
```

The body is validated by the same schema as the web app, so optional fields such as shared-expense data are accepted too.

## Errors and limits

Errors are JSON: `{ "message": "...", "issues"?: ... }` with status `400`, `401`, `403`, `404`, `429` or `500`. Validation failures use `message: "Validation failed"`. Error bodies never echo your key.

All `/v1` traffic (including unauthenticated) shares a rate limiter, keyed by key hash or IP: 120 requests per minute. Exceeding it returns `429`; see the `RateLimit-*` response headers.

Every `POST`/`PUT` is written to the server audit log (user, key id, operation, resource id, status; never bodies).
