"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Clapperboard, Heart, Home, Search, Shield, Tv, User } from "lucide-react";
import { Logo } from "./Logo";
import { api } from "./api";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/film", label: "Film", icon: Clapperboard },
  { href: "/serie", label: "Serie", icon: Tv },
  { href: "/la-mia-lista", label: "La mia lista", icon: Heart },
];

export function Header({ user }: { user: { name: string; role: string } | null }) {
  const path = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("click", close); return () => document.removeEventListener("click", close);
  }, []);

  if (path.startsWith("/guarda/")) return null; // player is full screen
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const logout = async () => { await api("/api/auth/logout", "POST"); router.push("/"); router.refresh(); };

  return (
    <>
      <header className={`sticky top-0 z-40 transition-colors duration-300 ${scrolled ? "bg-ink/90 backdrop-blur-md shadow-[0_1px_0_var(--color-line)]" : "bg-gradient-to-b from-ink/80 to-transparent"}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 md:px-10">
          <Link href="/" aria-label="Velluto, home"><Logo /></Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Principale">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={`rounded-full px-3 py-1.5 text-sm transition-colors ${active(n.href) ? "bg-cream/10 text-cream" : "text-mist hover:text-cream"}`}>{n.label}</Link>
            ))}
          </nav>
          <form className="ml-auto hidden items-center md:flex" role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/cerca?q=${encodeURIComponent(q.trim())}`); }}>
            <label className="relative">
              <span className="sr-only">Cerca</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Titoli, episodi, registi…" className="w-64 rounded-full border border-line bg-plum/70 py-2 pl-9 pr-3 text-sm placeholder:text-mist/70 focus:border-gold focus:outline-none" />
            </label>
          </form>
          <Link href="/cerca" className="ml-auto text-mist md:hidden" aria-label="Cerca"><Search className="h-5 w-5" /></Link>
          {user ? (
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} aria-label="Menu account"
                className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-gold to-rose font-semibold text-ink">
                {user.name.slice(0, 1).toUpperCase()}
              </button>
              {menu && (
                <div role="menu" className="card absolute right-0 mt-2 w-56 overflow-hidden p-1.5 text-sm shadow-2xl animate-fade-up">
                  <p className="px-3 py-2 text-mist">Ciao, <span className="text-cream">{user.name}</span></p>
                  <Link role="menuitem" href="/account" className="block rounded-lg px-3 py-2 hover:bg-cream/10" onClick={() => setMenu(false)}>Account e abbonamento</Link>
                  <Link role="menuitem" href="/cronologia" className="block rounded-lg px-3 py-2 hover:bg-cream/10" onClick={() => setMenu(false)}>Cronologia</Link>
                  {user.role === "admin" && <Link role="menuitem" href="/admin" className="block rounded-lg px-3 py-2 hover:bg-cream/10" onClick={() => setMenu(false)}>Pannello admin</Link>}
                  <button role="menuitem" onClick={logout} className="block w-full rounded-lg px-3 py-2 text-left text-rose hover:bg-cream/10">Esci</button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/accedi" className="btn btn-gold !py-2 text-sm">Accedi</Link>
          )}
        </div>
      </header>
      {/* mobile tab bar */}
      <nav aria-label="Navigazione mobile" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {[...NAV, user?.role === "admin" ? { href: "/admin", label: "Admin", icon: Shield } : { href: user ? "/account" : "/accedi", label: user ? "Account" : "Accedi", icon: User }].map((n) => (
            <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active(n.href) ? "text-gold" : "text-mist"}`}>
              <n.icon className="h-5 w-5" />{n.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
