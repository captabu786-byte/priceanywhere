import http from "node:http";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import "dotenv/config";
import { Pool } from "pg";

const PORT = Number(process.env.PORT || 3000);
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;

const demo = [
  {source:"Demo Store", externalId:"demo-iphone", title:"Apple iPhone 17 Pro Max 256GB", url:"#", image:"", seller:"Demo", country:"US", currency:"USD", price:1199, shipping:0, condition:"NEW", availability:"IN_STOCK"},
  {source:"Demo UK", externalId:"demo-iphone-uk", title:"Apple iPhone 17 Pro Max 256GB", url:"#", image:"", seller:"Demo UK", country:"GB", currency:"GBP", price:899, shipping:0, condition:"NEW", availability:"IN_STOCK"},
  {source:"Demo Uganda", externalId:"demo-iphone-ug", title:"Apple iPhone 17 Pro Max 256GB", url:"#", image:"", seller:"Demo Uganda", country:"UG", currency:"UGX", price:4650000, shipping:0, condition:"NEW", availability:"IN_STOCK"},
  {source:"Demo Store", externalId:"demo-ps5", title:"Sony PlayStation 5 Slim", url:"#", image:"", seller:"Demo", country:"US", currency:"USD", price:499, shipping:0, condition:"NEW", availability:"IN_STOCK"},
  {source:"Demo Store", externalId:"demo-mac", title:"Apple MacBook Air 15-inch", url:"#", image:"", seller:"Demo", country:"US", currency:"USD", price:1099, shipping:0, condition:"NEW", availability:"IN_STOCK"}
];

let ebayToken = null;
let ebayTokenExpires = 0;

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store"});
  res.end(body);
}

async function ebayAccessToken() {
  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) return null;
  if (ebayToken && Date.now() < ebayTokenExpires) return ebayToken;
  const basic = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
  const r = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method:"POST",
    headers: {
      "Content-Type":"application/x-www-form-urlencoded",
      "Authorization":`Basic ${basic}`
    },
    body:new URLSearchParams({grant_type:"client_credentials", scope:"https://api.ebay.com/oauth/api_scope"})
  });
  if (!r.ok) throw new Error(`eBay OAuth failed: ${r.status}`);
  const d = await r.json();
  ebayToken = d.access_token;
  ebayTokenExpires = Date.now() + Math.max(60, d.expires_in - 120) * 1000;
  return ebayToken;
}

async function searchEbay(query) {
  const token = await ebayAccessToken();
  if (!token) return [];
  const marketplace = process.env.EBAY_MARKETPLACE_ID || "EBAY_US";
  const endpoint = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("limit", "24");
  endpoint.searchParams.set("filter", "conditions:{NEW}");
  const r = await fetch(endpoint, {
    headers: {"Authorization":`Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID":marketplace}
  });
  if (!r.ok) throw new Error(`eBay search failed: ${r.status}`);
  const d = await r.json();
  return (d.itemSummaries || []).map(x => ({
    source:"eBay",
    externalId:x.itemId,
    title:x.title,
    url:x.itemWebUrl,
    image:x.image?.imageUrl || "",
    seller:x.seller?.username || "eBay seller",
    country:x.itemLocation?.country || "",
    currency:x.price?.currency || "USD",
    price:Number(x.price?.value || 0),
    shipping:Number(x.shippingOptions?.[0]?.shippingCost?.value || 0),
    condition:x.condition || "NEW",
    availability:x.estimatedAvailabilityStatus || "UNKNOWN"
  }));
}

async function ratesTo(base, symbols) {
  const wanted = symbols.filter(x => x !== base);
  if (!wanted.length) return {[base]:1};
  const r = await fetch(`https://api.frankfurter.dev/v2/rates?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(wanted.join(","))}`);
  if (!r.ok) throw new Error("Currency service unavailable");
  const arr = await r.json();
  const out = {[base]:1};
  for (const row of arr) out[row.quote] = row.rate;
  return out;
}

async function convertOffers(offers, target) {
  const currencies = [...new Set(offers.map(o => o.currency))];
  const grouped = {};
  for (const c of currencies) grouped[c] = await ratesTo(c, [target]);
  return offers.map(o => ({
    ...o,
    total: o.price + (o.shipping || 0),
    converted: Number(((o.price + (o.shipping || 0)) * (grouped[o.currency]?.[target] || 1)).toFixed(2)),
    convertedCurrency: target
  }));
}

async function saveOffers(offers) {
  if (!pool || !offers.length) return;
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const o of offers) {
      const p = await client.query(
        `insert into products(canonical_name) values($1)
         on conflict do nothing returning id`,
        [o.title]
      );
      let productId = p.rows[0]?.id;
      if (!productId) {
        const q = await client.query(`select id from products where canonical_name=$1 limit 1`, [o.title]);
        productId = q.rows[0]?.id;
      }
      const up = await client.query(
        `insert into offers(product_id,source,external_id,title,url,image_url,seller,country_code,currency,price,shipping,condition,availability,last_seen,updated_at)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),now())
         on conflict(source,external_id) do update set
          title=excluded.title,url=excluded.url,image_url=excluded.image_url,seller=excluded.seller,country_code=excluded.country_code,
          currency=excluded.currency,price=excluded.price,shipping=excluded.shipping,condition=excluded.condition,
          availability=excluded.availability,last_seen=now(),updated_at=now()
         returning id`,
        [productId,o.source,o.externalId,o.title,o.url,o.image,o.seller,o.country,o.currency,o.price,o.shipping,o.condition,o.availability]
      );
      await client.query(`insert into price_history(offer_id,price,shipping,currency) values($1,$2,$3,$4)`, [up.rows[0].id,o.price,o.shipping,o.currency]);
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally { client.release(); }
}

async function searchDatabase(query) {
  if (!pool) return [];
  const q = await pool.query(
    `select source,external_id as "externalId",title,url,image_url as image,seller,country_code as country,currency,price,shipping,condition,availability
     from offers where title ilike $1 order by price asc limit 100`,
    [`%${query}%`]
  );
  return q.rows;
}

async function handler(req, res) {
  const u = new URL(req.url, `http://${req.headers.host}`);
  if (u.pathname === "/api/health") return json(res,200,{ok:true, database:Boolean(pool), ebay:Boolean(process.env.EBAY_CLIENT_ID)});
  if (u.pathname === "/api/currencies") {
    try {
      const r = await fetch("https://api.frankfurter.dev/v2/currencies");
      return json(res,200,await r.json());
    } catch { return json(res,502,{error:"Currency service unavailable"}); }
  }
  if (u.pathname === "/api/search") {
    const query = (u.searchParams.get("q") || "").trim();
    const target = (u.searchParams.get("currency") || "USD").toUpperCase();
    if (!query) return json(res,400,{error:"Missing q"});
    try {
      let offers = await searchEbay(query);
      if (!offers.length) offers = await searchDatabase(query);
      if (!offers.length) offers = demo.filter(x => x.title.toLowerCase().includes(query.toLowerCase()));
      if (offers.length && pool) saveOffers(offers).catch(()=>{});
      const converted = await convertOffers(offers,target);
      converted.sort((a,b)=>a.converted-b.converted);
      if (pool) pool.query(`insert into search_logs(query) values($1)`,[query]).catch(()=>{});
      return json(res,200,{query,target,count:converted.length,live:Boolean(process.env.EBAY_CLIENT_ID),offers:converted});
    } catch(e) {
      return json(res,502,{error:e.message});
    }
  }
  if (u.pathname === "/api/price-history") {
    return json(res,200,{message:"Price history endpoint ready; pass a real offer ID after database setup."});
  }
  if (u.pathname.startsWith("/api/")) return json(res,404,{error:"API route not found"});
  let path = u.pathname === "/" ? "/index.html" : u.pathname;
  if (path.includes("..")) return json(res,400,{error:"Bad path"});
  const file = new URL(`../public${path}`, import.meta.url);
  try {
    const data = await readFile(file);
    const ext = path.split(".").pop();
    const types={html:"text/html",js:"text/javascript",css:"text/css",json:"application/json",svg:"image/svg+xml"};
    res.writeHead(200,{"Content-Type":`${types[ext]||"application/octet-stream"}; charset=utf-8`});
    res.end(data);
  } catch {
    res.writeHead(404); res.end("Not found");
  }
}

http.createServer(handler).listen(PORT,()=>console.log(`PriceAnywhere running at http://localhost:${PORT}`));
