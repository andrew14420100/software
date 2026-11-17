import type { Metadata } from "next";
import { ContactForm } from "@/components/sites/novashop/ContactForm";

export const metadata: Metadata = { title: "NovaShop — About" };

export default function About() {
  return (
    <section className="about">
      <h1>About NovaShop</h1>
      <p>
        We are a tiny demo store used to verify that cloned pages, interactions and APIs behave exactly like the
        original.
      </p>
      <h2>Contact us</h2>
      <ContactForm />
    </section>
  );
}
