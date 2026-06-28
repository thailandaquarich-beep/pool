# Local Ports

| Service | Port | Notes |
| --- | ---: | --- |
| Booking API | 5000 | Express backend. Uses `PORT=5000` by default. |
| Web engine | 8080 | Public/local web entry when you want the site on `localhost:8080`. |
| pnpm/Vite dev | 5173 | Default Vite dev server for `artifacts/pool-reservation`. |
| Postgres | 5432 | Database port used by `DATABASE_URL`. |
| Aqua AI gateway | 8787 | `gemma-chat/server.mjs`, proxied by `/ai/*`. |
| Ollama | 11434 | Local AI model server, read through `OLLAMA_URL`. |

Cloudflare Pages hosts only the frontend build. Set `VITE_API_BASE_URL` during the Pages build to the public backend URL, for example:

```text
VITE_API_BASE_URL=https://api.example.com
```

The backend must allow the Cloudflare frontend origin with `CORS_ORIGINS`, for example:

```text
CORS_ORIGINS=https://pool-reservation.pages.dev,https://booking.example.com
```
