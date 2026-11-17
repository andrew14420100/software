"use client";
import Link from "next/link";
import { useState } from "react";

export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header>
      <Link className="logo" href="/">
        Nova<span>Shop</span>
      </Link>
      <button className="burger" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
        Menu
      </button>
      <nav className={open ? "open" : undefined}>
        <Link href="/">Home</Link>
        <Link href="/products">Products</Link>
        <Link href="/about">About</Link>
      </nav>
    </header>
  );
}
