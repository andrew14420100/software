// Demo "original" site (authorized test fixture): static pages + JSON API.
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const D = path.dirname(fileURLToPath(import.meta.url));
const products = [
  { id: 1, name: "Aurora Lamp", description: "Warm LED desk light.", price: 49, featured: true },
  { id: 2, name: "Pocket Driver", description: "24-bit precision kit.", price: 29.5, featured: true },
  { id: 3, name: "Loom Notebook", description: "Dot grid, lay-flat.", price: 12, featured: true },
  { id: 4, name: "Flux Mat", description: "Heat-resistant work mat.", price: 18.75, featured: false },
  { id: 5, name: "Arc Caliper", description: "Digital, 150 mm.", price: 34, featured: false },
  { id: 6, name: "Nimbus Stand", description: "Aluminium laptop stand.", price: 59, featured: false }];
const header = `<header><a class="logo" href="/">Nova<span>Shop</span></a><button class="burger" aria-label="Menu">Menu</button><nav><a href="/">Home</a><a href="/products">Products</a><a href="/about">About</a></nav></header>`;
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NovaShop — ${title}</title><link rel="stylesheet" href="/style.css"></head><body>${header}${body}<footer>© 2026 NovaShop demo — authorized test fixture</footer><script src="/app.js"></script></body></html>`;
const pages = {
  "/": page("Home", `<section class="hero"><h1>Gear for curious makers</h1><p>Hand-picked tools, shipped fast. Built as a WebClone Lab test fixture.</p><a class="btn" href="/products">Browse products</a></section><div class="grid" id="featured"></div>`),
  "/products": page("Products", `<div class="grid" id="all"></div>`),
  "/about": page("About", `<section class="about"><h1>About NovaShop</h1><p>We are a tiny demo store used to verify that cloned pages, interactions and APIs behave exactly like the original.</p><h2>Contact us</h2><form id="contact"><input name="email" placeholder="Email"><textarea name="message" placeholder="Message"></textarea><button class="btn" type="submit" style="background:#6b5cff;color:#fff">Send</button></form><p id="sent"></p></section>`),
};
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/api/products") {
    const fq = u.searchParams.get("featured");
    const items = fq ? products.filter((p) => String(p.featured) === fq) : products;
    res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ total: items.length, items }));
  }
  if (u.pathname === "/api/messages" && req.method === "POST") { res.writeHead(201, { "content-type": "application/json" }); return res.end('{"ok":true}'); }
  if (pages[u.pathname]) { res.writeHead(200, { "content-type": "text/html" }); return res.end(pages[u.pathname]); }
  const file = { "/style.css": ["style.css", "text/css"], "/app.js": ["app.js", "text/javascript"] }[u.pathname];
  if (!file) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "content-type": file[1] }); fs.createReadStream(path.join(D, file[0])).pipe(res);
}).listen(Number(process.env.PORT || 8080), "127.0.0.1", () => console.log("original on :" + (process.env.PORT || 8080)));
