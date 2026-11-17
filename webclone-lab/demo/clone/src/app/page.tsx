import Link from "next/link";
import { ProductGrid } from "@/components/sites/novashop/ProductGrid";

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>Gear for curious makers</h1>
        <p>Hand-picked tools, shipped fast. Built as a WebClone Lab test fixture.</p>
        <Link className="btn" href="/products">
          Browse products
        </Link>
      </section>
      <ProductGrid id="featured" query="?featured=true" />
    </>
  );
}
