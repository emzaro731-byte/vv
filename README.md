# VV — Virtual Numbers

A lightweight dashboard for a virtual-number service with calls, SMS and supported verification workflows.

## Current build

- Responsive virtual-number dashboard
- Active-number list
- SMS inbox
- Provider/demo status
- Server-side API boundary
- Safe-by-default demo mode
- Provider integration points for number provisioning, SMS and voice

## Run locally

Requires Node.js 20+.

```bash
npm start
```

Open http://localhost:3000

## Going live

A real virtual number cannot be generated locally. A licensed telecom/VoIP provider must allocate the number. Add the provider integration on the server only, never in browser JavaScript.

Recommended environment variables:

```
NUMBER_PROVIDER_BASE_URL=
NUMBER_PROVIDER_API_KEY=
PORT=3000
```

The exact provisioning, SMS and voice requests depend on the provider's documented API. Implement those calls in `server.js` after choosing the provider and completing its business/KYC requirements.

### Security

- Never expose provider API secrets in frontend code.
- Verify webhook signatures before accepting inbound SMS/call events.
- Add authentication before allowing users to access numbers or messages.
- Add rate limits and audit logs.
- Do not design the service to bypass another platform's verification or identity checks.

## Next integration points

- POST /api/numbers/request
- POST /api/messages/send
- POST /api/calls
- Provider webhook endpoint for inbound SMS
- Provider webhook endpoint for call status
- User authentication and database
- Billing/subscriptions
