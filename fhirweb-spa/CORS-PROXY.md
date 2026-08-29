# CORS Configuration for External FHIR Servers

## Problem

When running the application locally against external FHIR servers (Azure, HealthX, etc.), browser CORS restrictions block API calls because the servers don't have CORS headers configured for localhost.

## Solution

The Vite development server includes proxy configuration to route external API calls through localhost, bypassing CORS issues.

## How It Works

### Proxy Configuration (vite.config.ts)

The dev server includes these proxy routes:

| Proxy Path    | Target Server               | Purpose            |
| ------------- | --------------------------- | ------------------ |
| `/fhir-azure` | http://20.212.110.174/fhir  | Azure FHIR server  |
| `/fhir-proxy` | http://hapi.fhir.org/baseR5 | HAPI FHIR (public) |

### Automatic URL Routing (client.ts)

The FHIR client automatically detects the server and uses the appropriate proxy:

```
FHIR_BASE_URL (config)  →  getProxyUrl()  →  Actual request URL
─────────────────────      ──────────────     ─────────────────
http://20.212.110.174/fhir     (in dev)    /fhir-azure
http://localhost:8080/fhir     (no change)  http://localhost:8080/fhir
```

For Agent APIs (global search, clinical docs import, digital twin), use `VITE_AGENT_API_BASE_URL`:

- No proxy routing needed for Agent APIs in dev (they go directly or through localhost)
- Configured in `.env` files for each profile

### Example Flow

**Request:** `http://20.212.110.174/fhir/Patient?name:contains=DEMO`

1. Browser makes request to proxy: `http://localhost:3000/fhir-azure/Patient?name:contains=DEMO`
2. Vite dev server intercepts `/fhir-azure` requests
3. Rewrites path to: `/fhir/Patient?name:contains=DEMO`
4. Routes to: `http://20.212.110.174/fhir/Patient?name:contains=DEMO`
5. Response is proxied back through localhost (no CORS issue!)

## Using Different FHIR Servers

### Azure FHIR

```bash
npm run dev:azure
```

- Uses proxy: `/fhir-azure`
- No CORS issues during development

### Local Development

```bash
npm run dev
```

- Uses `http://localhost:8080/fhir`
- No proxy needed (same origin)

## Production Considerations

In production builds, the proxy is **not used** because:

1. Production builds run on a web server (not Vite dev server)
2. The FHIR server should be configured to accept requests from your domain
3. Or an API gateway/reverse proxy should handle CORS headers

To deploy to production, ensure your FHIR server:

- Allows your domain origin in CORS headers, OR
- Is accessed through an API gateway that adds CORS headers, OR
- Is deployed on the same domain as your web app

## Adding a New FHIR Server

To add support for a new external FHIR server:

### 1. Update `vite.config.ts`

Add a new proxy in the `server.proxy` section:

```typescript
'/fhir-newserver': {
  target: 'http://your-server-url',
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/fhir-newserver/, '/path-to-fhir'),
},
```

### 2. Update `client.ts`

Add the mapping in the `getProxyUrl()` function:

```typescript
if (url.includes('your-server-url')) {
  return '/fhir-newserver';
}
```

### 3. Create/Update Profile

Create `.env.newserver` file:

```bash
VITE_FHIR_BASE_URL=http://your-server-url/fhir
VITE_API_KEY=your-api-key
```

### 4. Update `package.json`

Add npm scripts:

```json
"dev:newserver": "vite --mode newserver",
"build:newserver": "tsc && vite build --mode newserver"
```

## Debugging CORS Issues

### Check Browser Console

- Look for CORS errors in Network tab
- Check which URL is being requested
- Verify the proxy path matches the configuration

### Verify Proxy is Working

```bash
# In browser console
fetch('/fhir-azure/Patient?_summary=count')
  .then(r => r.json())
  .then(data => console.log('Proxy works!', data))
```

### Enable Debug Logging

The client automatically logs the URL transformation:

```
FHIR Base URL: http://20.212.110.174/fhir → /fhir-azure
```

## Common Issues

### "CORS policy: No 'Access-Control-Allow-Origin' header"

- **Cause:** Proxy not configured or not being used
- **Fix:** Verify `getProxyUrl()` correctly detects your server URL
- **Check:** Inspect Network tab to see request URL starts with `/fhir-*`

### API Key Not Being Sent

- **Cause:** Proxy not forwarding headers
- **Fix:** Vite proxy automatically forwards headers by default
- **Check:** Verify `x-api-key` header in Network tab

### "Cannot find module" errors

- **Cause:** Node modules not installed after config changes
- **Fix:** Run `npm install` and restart dev server

## References

- [Vite Proxy Documentation](https://vitejs.dev/config/server-options.html#server-proxy)
- [HTTP Proxy Middleware](https://github.com/chimurai/http-proxy-middleware)
- [CORS Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
