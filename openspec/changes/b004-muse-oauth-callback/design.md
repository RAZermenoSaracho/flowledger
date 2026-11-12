# Design

## Decision

Keep CIMD as the only client registration model. Muse's callback is an `https` URI, which `cimdDocumentSchema` already accepts, and matching is exact at `/authorize` and again at consent. Only tests and docs change.

## Alternatives considered

- **Hardcoded redirect allowlist entry.** Rejected: there is no allowlist. Adding one would make a callback URL alone authorize a client, which is exactly what must not happen.
- **Allowlist-restricted, stateless DCR** (`registerClient` accepting only public clients whose `redirect_uris` are all in a fixed list, with a signed `client_id`). Viable and small, and needs no table. Deferred because it reverses an explicit spec decision, and adding a `registration_endpoint` to metadata may change how existing clients register, which cannot be checked offline. This is the design to adopt if Muse is confirmed to need DCR.
