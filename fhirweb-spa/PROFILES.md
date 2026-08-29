# FHIR Server Profiles

This project supports multiple FHIR server configurations through environment profiles.

## Available Profiles

### 1. **Azure FHIR** (`.env.azure`)

Azure FHIR server hosted at `http://20.212.110.174/fhir`

**Usage:**

```bash
npm run dev:azure        # Start development server
npm run build:azure      # Build for Azure
```

**Configuration:**

- Base URL: `http://20.212.110.174/fhir`
- API Key: `your_api_key_here` (customize as needed)

### 2. **Development** (`.env.development`)

Local development configuration with localhost

**Usage:**

```bash
npm run dev              # Start development server (default)
```

**Configuration:**

- Base URL: `http://localhost:8080/fhir`
- API Key: `your_api_key_here` (customize as needed)

### 3. **Production** (`.env.production`)

Production configuration (template)

**Usage:**

```bash
npm run build            # Build for production (default)
```

**Configuration:**

- Base URL: Replace with your production server URL
- API Key: Replace with your production API key

## Environment Variables

All profiles use these environment variables:

- **`VITE_FHIR_BASE_URL`**: Base URL of the FHIR server (includes /fhir path)
- **`VITE_AGENT_API_BASE_URL`**: Base URL for Agent/AI APIs (for global search, clinical docs import, digital twin)
  - Used by: `/api/ai/hybrid-search`, `/api/persona/DataPipelinePersona/...`, `/api/agent/AgentPersona/...`
  - Usually same base as FHIR server but without /fhir path
- **`VITE_API_KEY`**: API key for authentication (sent as `x-api-key` header)
- **`VITE_SSE_BASE_URL`**: Base URL for Server-Sent Events (real-time notifications)

## Switching Between Profiles

### During Development

Start the development server with a specific profile:

```bash
npm run dev:azure        # Use Azure FHIR server
npm run dev              # Use local development server
```

### During Build

Build for a specific profile:

```bash
npm run build:azure      # Build targeting Azure FHIR server
npm run build            # Build for production (default)
```

## Adding a New Profile

To add a new FHIR server profile:

1. Create a new `.env.{profile-name}` file in the root directory
2. Add the FHIR server configuration variables
3. Add npm scripts to `package.json`:
   ```json
   "dev:{profile-name}": "vite --mode {profile-name}",
   "build:{profile-name}": "tsc && vite build --mode {profile-name}"
   ```
4. Run with: `npm run dev:{profile-name}`

## How It Works

The project uses **Vite's environment modes** feature to load different `.env.*` files based on the `--mode` flag. When you run `npm run dev:azure`, Vite automatically:

1. Loads `.env.azure` file
2. Injects `VITE_*` variables into the application
3. Variables are accessible via `import.meta.env.VITE_*`

This configuration is defined in `src/services/fhir/client.ts`:

```typescript
const FHIR_BASE_URL = import.meta.env.VITE_FHIR_BASE_URL || '...';
const API_KEY = import.meta.env.VITE_API_KEY || '...';
```

## Notes

- **Security**: Do not commit actual API keys to version control. Use `.gitignore` to exclude `.env.*` files
- **Default Fallbacks**: The code has fallback values in case environment variables are not set
- **CORS**: Some servers may require proxy configuration in `vite.config.ts` if running from the browser
