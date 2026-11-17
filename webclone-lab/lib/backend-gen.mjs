// Independent backend reconstruction from observed (authorized) API traffic.
// Produces: routes.json, db.json, schema.sql (+seed), openapi.json, server.mjs
// The server is a dependency-free Node HTTP server: it does NOT proxy or call
// the original backend; it re-implements the observed contract locally.
import fs from "node:fs";
import path from "node:path";

const ID_SEG = /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24})$/i;

function templatePath(u, origin) {
  const segs = u.pathname.split("/").filter(Boolean).map((s) => (ID_SEG.test(s) ? ":id" : s));
  const prefix = u.origin === origin ? "" : `/__ext/${u.host}`;
  return prefix + "/" + segs.join("/");
}

// array of records inside a body: [..] or {data|items|results|...: [..]}
function findRows(body) {
  if (Array.isArray(body) && body.length && body.every((r) => r && typeof r === "object" && !Array.isArray(r))) return { rows: body, key: null };
  if (body && typeof body === "object") for (const [k, v] of Object.entries(body)) {
    if (Array.isArray(v) && v.length && v.every((r) => r && typeof r === "object" && !Array.isArray(r))) return { rows: v, key: k };
  }
  return null;
}

function sqlType(vals) {
  const v = vals.filter((x) => x !== null && x !== undefined);
  if (!v.length) return "TEXT";
  if (v.every((x) => typeof x === "boolean")) return "BOOLEAN";
  if (v.every((x) => Number.isInteger(x))) return "INTEGER";
  if (v.every((x) => typeof x === "number")) return "REAL";
  if (v.every((x) => typeof x === "string")) return "TEXT";
  return "JSON";
}
const jsType = (t) => ({ BOOLEAN: "boolean", INTEGER: "integer", REAL: "number", TEXT: "string", JSON: "object" })[t];
const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : typeof v === "boolean" ? (v ? "1" : "0") : `'${(typeof v === "string" ? v : JSON.stringify(v)).replace(/'/g, "''")}'`);

function schemaOf(v) {
  if (Array.isArray(v)) return { type: "array", items: v.length ? schemaOf(v[0]) : {} };
  if (v === null) return { type: "null" };
  if (typeof v === "object") return { type: "object", properties: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, schemaOf(x)])) };
  return { type: Number.isInteger(v) ? "integer" : typeof v };
}

export function generateBackend({ captured, origin, outDir, libDir }) {
  fs.mkdirSync(outDir, { recursive: true });
  const endpoints = new Map();
  for (const c of captured) {
    let u; try { u = new URL(c.url); } catch { continue; }
    const tpl = templatePath(u, origin);
    const key = `${c.method} ${tpl}`;
    const e = endpoints.get(key) || { method: c.method, path: tpl, upstream: `${u.origin}${u.pathname}`, samples: 0, status: c.status, contentType: c.contentType, body: c.body, requestBody: c.requestBody, query: {} };
    e.samples++;
    for (const [k, v] of u.searchParams) e.query[k] = v;
    if (c.body !== null && c.body !== undefined) {
      // keep the unfiltered sample as fixture; merge records of every sample by id
      if (!u.search || e.body === undefined || e.body === null) e.body = c.body;
      const f = findRows(c.body);
      if (f) { e.rows ||= new Map(); f.rows.forEach((r, i) => e.rows.set(String(r.id ?? r._id ?? r.uuid ?? `${e.rows.size}-${i}`), r)); }
    }
    endpoints.set(key, e);
  }

  const db = {}; const tables = []; const routes = [];
  for (const e of endpoints.values()) {
    const route = { method: e.method, path: e.path, status: e.status, contentType: e.contentType || "application/json", fixture: e.body };
    const found = e.method === "GET" ? findRows(e.body) : null;
    if (found && e.rows) found.rows = [...e.rows.values()];
    if (found && !e.path.endsWith(":id")) {
      const name = (e.path.split("/").filter((s) => s && s !== ":id").pop() || "items").replace(/[^a-zA-Z0-9_]/g, "_");
      if (!db[name]) {
        db[name] = found.rows;
        const cols = [...new Set(found.rows.flatMap((r) => Object.keys(r)))];
        tables.push({ name, cols: cols.map((c) => ({ name: c, type: sqlType(found.rows.map((r) => r[c])) })), rows: found.rows });
      }
      Object.assign(route, { collection: name, wrapperKey: found.key, fixture: found.key ? { ...e.body, [found.key]: undefined } : null });
      // CRUD companions for the collection (re-implemented locally)
      for (const m of ["POST"]) routes.push({ method: m, path: e.path, collection: name, op: "create" });
      for (const m of ["GET", "PUT", "PATCH", "DELETE"]) routes.push({ method: m, path: e.path + "/:id", collection: name, op: m === "GET" ? "read" : m === "DELETE" ? "delete" : "update" });
      route.op = "list";
    }
    routes.unshift(route);
  }
  // de-duplicate: observed routes win over synthesized CRUD routes
  const seen = new Set(); const finalRoutes = routes.filter((r) => { const k = `${r.method} ${r.path}`; if (seen.has(k)) return false; seen.add(k); return true; });

  const sql = ["-- Reconstructed from observed API responses. Review types/keys before production.", ""];
  for (const t of tables) {
    const hasId = t.cols.some((c) => c.name === "id");
    sql.push(`CREATE TABLE IF NOT EXISTS "${t.name}" (`, t.cols.map((c) => `  "${c.name}" ${c.type}${c.name === "id" ? " PRIMARY KEY" : ""}`).join(",\n") + (hasId ? "" : ",\n  \"_rowid\" INTEGER PRIMARY KEY"), ");", "");
    for (const r of t.rows) sql.push(`INSERT INTO "${t.name}" (${t.cols.map((c) => `"${c.name}"`).join(", ")}) VALUES (${t.cols.map((c) => q(r[c.name])).join(", ")});`);
    sql.push("");
  }

  const openapi = { openapi: "3.1.0", info: { title: `Reconstructed API for ${origin}`, version: "0.1.0", description: "Inferred from authorized observation of client traffic." }, servers: [{ url: "http://127.0.0.1:4010" }], paths: {} };
  for (const r of finalRoutes) {
    const p = r.path.replace(/:id/g, "{id}");
    openapi.paths[p] ||= {};
    openapi.paths[p][r.method.toLowerCase()] = {
      summary: r.op ? `${r.op} ${r.collection}` : `observed ${r.method} ${r.path}`,
      parameters: p.includes("{id}") ? [{ name: "id", in: "path", required: true, schema: { type: "string" } }] : [],
      responses: { [r.status || 200]: { description: "observed", content: r.fixture !== undefined || r.collection ? { "application/json": { schema: r.collection ? { type: "array", items: { type: "object", properties: Object.fromEntries((tables.find((t) => t.name === r.collection)?.cols || []).map((c) => [c.name, { type: jsType(c.type) }])) } } : schemaOf(r.fixture) } } : undefined } },
    };
  }

  fs.writeFileSync(path.join(outDir, "routes.json"), JSON.stringify(finalRoutes, null, 2));
  if (!fs.existsSync(path.join(outDir, "db.json"))) fs.writeFileSync(path.join(outDir, "db.json"), JSON.stringify(db, null, 2));
  fs.writeFileSync(path.join(outDir, "db.seed.json"), JSON.stringify(db, null, 2));
  fs.writeFileSync(path.join(outDir, "schema.sql"), sql.join("\n"));
  fs.writeFileSync(path.join(outDir, "openapi.json"), JSON.stringify(openapi, null, 2));
  fs.copyFileSync(path.join(libDir, "backend-server.mjs"), path.join(outDir, "server.mjs"));
  const sameOrigin = [...new Set(finalRoutes.filter((r) => !r.path.startsWith("/__ext/")).map((r) => r.path.split("/").slice(0, 2).join("/")))];
  const rewrites = sameOrigin.map((p) => ({ source: `${p}/:path*`, destination: `http://127.0.0.1:4010${p}/:path*` })).concat([{ source: "/__ext/:path*", destination: "http://127.0.0.1:4010/__ext/:path*" }]);
  fs.writeFileSync(path.join(outDir, "next-rewrites.json"), JSON.stringify(rewrites, null, 2));
  return { endpoints: finalRoutes.length, observed: endpoints.size, tables: tables.map((t) => `${t.name}(${t.rows.length} rows)`), outDir, run: "node backend/server.mjs  (PORT=4010)" };
}
