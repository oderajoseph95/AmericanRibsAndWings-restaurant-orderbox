# Local Development Setup Guide

This guide will help you set up and run the American Ribs & Wings ordering system locally.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **npm** (comes with Node.js) or **Bun** (optional, faster alternative)
- **Git** - [Download](https://git-scm.com/)
- **Supabase CLI** (optional, for local Supabase development) - [Install Guide](https://supabase.com/docs/guides/cli)

## Step 1: Clone the Repository

```bash
git clone <repository-url>
cd AmericanRibsAndWings-restaurant-orderbox
```

## Step 2: Install Dependencies

Using npm:
```bash
npm install
```

Or using Bun (faster):
```bash
bun install
```

## Step 3: Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key

# Optional: Google Maps API Key (if running edge functions locally)
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

### Getting Your Supabase Credentials

1. Go to your [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon/public key** → `VITE_SUPABASE_PUBLISHABLE_KEY`

### Getting Google Maps API Key (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable **Maps JavaScript API** and **Routes API**
4. Create credentials (API Key)
5. Add the key to your `.env` file

> **Note:** For local development, you can use the production Supabase instance. The edge functions will run on Supabase's servers, not locally.

## Step 4: Run the Development Server

Start the development server:

```bash
npm run dev
```

Or with Bun:
```bash
bun run dev
```

The application will be available at:
- **Local:** http://localhost:8080
- **Network:** http://[your-ip]:8080

## Step 5: Access the Application

Once the server is running, you can access:

- **Customer Portal:** http://localhost:8080
- **Admin Panel:** http://localhost:8080/admin
- **Driver Portal:** http://localhost:8080/driver

## Available Scripts

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Build for development mode
npm run build:dev

# Preview production build
npm run preview

# Run linter
npm run lint
```

## Troubleshooting

### Port Already in Use

If port 8080 is already in use, you can change it in `vite.config.ts`:

```typescript
server: {
  host: "::",
  port: 3000, // Change to your preferred port
},
```

### Environment Variables Not Loading

1. Ensure your `.env` file is in the root directory (same level as `package.json`)
2. Restart the development server after adding/changing environment variables
3. Vite requires the `VITE_` prefix for environment variables to be exposed to the client

### Supabase Connection Issues

1. Verify your Supabase URL and key are correct
2. Check that your Supabase project is active
3. Ensure your IP is not blocked by Supabase (check Supabase dashboard)

### Google Maps Not Loading

1. Verify your Google Maps API key is valid
2. Check that the required APIs are enabled:
   - Maps JavaScript API
   - Routes API
   - Places API (if using autocomplete)
3. Ensure your API key has proper restrictions set up

## Local Supabase Development (Advanced)

If you want to run Supabase locally:

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Start local Supabase:
   ```bash
   supabase start
   ```

3. Update your `.env` file with local credentials (shown in CLI output)

4. Run migrations:
   ```bash
   supabase db reset
   ```

> **Note:** Local Supabase requires Docker to be installed and running.

## Database Migrations

The project uses Supabase migrations located in `supabase/migrations/`. These are automatically applied when:
- Using Supabase hosted service (via dashboard)
- Running `supabase db reset` locally

## Edge Functions

Edge functions are located in `supabase/functions/` and run on Supabase's infrastructure. To deploy:

```bash
supabase functions deploy <function-name>
```

Or deploy all functions:
```bash
supabase functions deploy
```

## Next Steps

1. **Set up authentication:** Create admin users through the Supabase dashboard or admin panel
2. **Configure settings:** Access the admin panel to configure business settings
3. **Add products:** Use the admin panel to add products, categories, and flavors
4. **Test ordering flow:** Place a test order to verify the complete flow

## Additional Resources

- [Vite Documentation](https://vitejs.dev/)
- [Supabase Documentation](https://supabase.com/docs)
- [React Documentation](https://react.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/)

---

**Need Help?** Check the main [README.md](./README.md) for more information about the project.
