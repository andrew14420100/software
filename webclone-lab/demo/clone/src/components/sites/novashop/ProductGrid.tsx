"use client";
import { useEffect, useState } from "react";

type Product = { id: number; name: string; description: string; price: number; featured: boolean };

export function ProductGrid({ id, query = "" }: { id: string; query?: string }) {
  const [items, setItems] = useState<Product[]>([]);
  useEffect(() => {
    fetch("/api/products" + query)
      .then((r) => r.json())
      .then((d: { items: Product[] }) => setItems(d.items));
  }, [query]);
  return (
    <div className="grid" id={id}>
      {items.map((p) => (
        <div className="card" key={p.id}>
          <h3>{p.name}</h3>
          <p>{p.description}</p>
          <div className="price">${p.price.toFixed(2)}</div>
        </div>
      ))}
    </div>
  );
}
