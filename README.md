# VV — Virtual Numbers

A lightweight dashboard for a virtual-number service with calls, SMS and supported verification workflows.

## Current build

- Responsive virtual-number dashboard
- Active-number list
- SMS inbox
- Voicebip provider adapter
- +234 number provisioning endpoint
- SMS sending endpoint
- Signed inbound SMS webhook
- Safe demo mode when provider credentials are absent

## Provider

VV is wired for Voicebip. Voicebip documents real Nigerian +234 numbers and APIs for number provisioning, SMS and voice/WhatsApp infrastructure. cite references are intentionally not stored in source files.

Create a Voicebip account/API key and configure the server environment:

```
VOICEBIP_API_KEY=pk_test_or_live_key
VOICEBIP_AGENT_ID=agt_xxx
VOICEBIP_WEBHOOK_SECRET=your_webhook_secret
VOICEBIP_BASE_URL=https://api.voicebip.com/v1
PORT=3000
```

Use a `pk_test_` key while developing. Switch to a live key only after your provider account is approved and you are ready for real telecom traffic.

## Run locally

Requires Node.js 20+.

```bash
npm start
```

Open http://localhost:3000

## API

- `GET /api/status`
- `GET /api/numbers`
- `POST /api/numbers/request`
- `GET /api/messages`
- `POST /api/messages/send`
- `POST /api/webhooks/voicebip`

## Webhooks

Configure the provider webhook to:

```
https://YOUR-DOMAIN/api/webhooks/voicebip
```

The server verifies the `X-Voicebip-Signature` HMAC before accepting inbound events.

## Security

- Provider keys stay server-side.
- Add user authentication before exposing numbers or SMS.
- Add rate limits and audit logs before production.
- Store only the minimum personal/message data required.
- Do not use the service to bypass another platform's verification or identity checks.

## Production checklist

1. Complete provider/business onboarding.
2. Add the live API key as a server secret.
3. Create the production agent and save its agent ID.
4. Configure the webhook URL and secret.
5. Test inbound SMS and calls.
6. Add authentication and per-user number ownership.
7. Add billing if users will rent numbers.
8. Add database persistence for numbers, messages and call records.
