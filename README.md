# PriceAnywhere 2.0

This is a production-oriented foundation for a global price comparison engine.

## Included
- Responsive frontend
- Node HTTP API server
- eBay Browse API connector with OAuth
- PostgreSQL/Supabase-ready schema
- Offer and price-history tables
- Currency conversion using Frankfurter
- Search endpoint
- Demo fallback when live credentials/database are not configured
- Environment-variable secret handling

## Put it online

The project is Docker/Render-ready. The easiest path is: upload this folder to GitHub, create a Web Service from the repository on Render, and add the environment variables shown in `.env.example`. The included `render.yaml` and `Dockerfile` handle the application start-up. You still need your own PostgreSQL/Supabase database and approved retailer API credentials for real marketplace prices.

## Run locally

1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Run `npm install`.
4. Optional: create a PostgreSQL/Supabase project and run `db/schema.sql`.
5. Put your database connection string in `.env`.
6. Put approved eBay production Client ID and Client Secret in `.env`.
7. Run `npm start`.
8. Open http://localhost:3000

## eBay production
eBay Buy API production access is not automatic. The application needs appropriate eBay Partner Network / production approval. Until then, the site can run in demo/database mode.

## Architecture

Browser -> /api/search -> retailer connectors -> normalization -> database -> currency conversion -> browser.

## Next production upgrades
- Add more approved retailer APIs/feeds.
- Better product identity using GTIN/EAN/UPC/MPN.
- Shipping/tax estimation by destination.
- Scheduled refresh workers.
- Price alerts and accounts.
- Affiliate attribution.
- Redis caching/rate limiting.
- Admin dashboard for source health and product matching.
