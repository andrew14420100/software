const card = (p) => `<div class="card"><h3>${p.name}</h3><p>${p.description}</p><div class="price">$${p.price.toFixed(2)}</div></div>`;
async function load(id, q) { const el = document.getElementById(id); if (!el) return; const r = await fetch('/api/products' + q); const d = await r.json(); el.innerHTML = d.items.map(card).join(''); }
load('featured', '?featured=true'); load('all', '');
document.querySelector('.burger').addEventListener('click', () => document.querySelector('nav').classList.toggle('open'));
const f = document.getElementById('contact');
if (f) f.addEventListener('submit', async (e) => { e.preventDefault(); const r = await fetch('/api/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(f))) }); document.getElementById('sent').textContent = r.ok ? 'Thanks!' : 'Error'; });
