# Server configuration

The public repository deliberately excludes every `.env*` file, including examples. Configure variables in the server environment or the Vercel project's environment settings. No environment file or credential is needed to run the synthetic demo locally.

| Variable | Purpose | Default behavior when unset |
| --- | --- | --- |
| `PORT` | Local development server port | `8766`, listening on `127.0.0.1` |
| `ERP_FORWARDING_ENABLED` | Explicitly enables forwarding on the main measurements API only when set to `true` | Disabled |
| `ERP_WEBHOOK_URL` | HTTPS endpoint for approved ERP middleware; inline credentials are rejected | No forwarding |
| `ERP_API_KEY` | Server-side credential for middleware authentication | No authentication header |
| `ERP_AUTH_TYPE` | `bearer` or `x-api-key` for that credential | Bearer when a key is configured |
| `ERP_WEBHOOK_SECRET` | Optional secret used for the request-body HMAC signature | No signature header |
| `ERP_FIELD_MAP` | Optional JSON mapping from middleware field names to validated record paths | Sends the canonical record |
| `CORS_ALLOWED_ORIGINS` | Comma-separated origins allowed for cross-origin API calls | No cross-origin access headers |

The static/hybrid/parallel measurement endpoints are validation-only simulation contracts. They do not persist records or forward to Oracle NetSuite. The main `/api/measurements` endpoint also has no persistence; forwarding is disabled unless configured explicitly. HTTP acceptance by middleware is not a NetSuite business acknowledgement. Do not enable forwarding to a real ERP account solely to try the public demo.

This repository does not contain a NetSuite account ID, sandbox token, production endpoint, database connection string, uploaded operator evidence or active login credentials. Keep real server values outside Git. The existing Vercel website is hosted separately; publishing this repository does not deploy to a VPS.

Run the current demo with Node.js 22:

```sh
npm start
```

Open `http://127.0.0.1:8766/`. The app has no external npm dependencies; the browser libraries are included under `public/vendor`. Run `npm test` for regression checks and `npm run build` to copy public assets into `dist` for static hosting. The Vercel Node API source is under `api` with its shared validation logic under `lib`.
