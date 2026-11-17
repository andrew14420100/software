import type { Metadata } from "next";
import { ProductGrid } from "@/components/sites/novashop/ProductGrid";

export const metadata: Metadata = { title: "NovaShop — Products" };

export default function Products() {
  return <ProductGrid id="all" />;
}
