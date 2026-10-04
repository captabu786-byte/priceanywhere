# Put PriceAnywhere Online

## Fastest route: GitHub + Render

1. Create a GitHub account if you do not already have one.
2. Create a new repository called `priceanywhere`.
3. Upload every file in this project, preserving the folders (`public`, `src`, `db`).
4. On Render, create a **Web Service** from that GitHub repository.
5. Use the included `Dockerfile` (Render detects it automatically).
6. Add these environment variables:
   - `DATABASE_URL` — your PostgreSQL/Supabase connection string.
   - `EBAY_CLIENT_ID` — your approved eBay application client ID.
   - `EBAY_CLIENT_SECRET` — your approved eBay application client secret.
   - `EBAY_MARKETPLACE_ID=EBAY_US`
   - `PORT=3000`
7. Deploy. Render gives you a public `onrender.com` address.
8. Open that address and test a search.

## Database

Create a PostgreSQL/Supabase database and run `db/schema.sql` once. Keep the database password private.

## Important: live retailer prices

The site can be publicly reachable without retailer credentials, but it will not become a real global price-comparison engine until approved retailer APIs/feeds are connected. The included eBay connector is ready for credentials after the required access/approval is obtained.

## Before a public launch

- Add a custom domain.
- Add Terms of Service and Privacy Policy pages.
- Add an affiliate disclosure if affiliate links are used.
- Add rate limiting and caching.
- Add more retailer connectors.
- Improve product matching using GTIN/EAN/UPC/MPN and variants.
- Add scheduled price refresh jobs.
- Add monitoring and error alerts.
