"use client";
import { useState } from "react";

export function ContactForm() {
  const [sent, setSent] = useState("");
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await fetch("/api/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
    });
    setSent(r.ok ? "Thanks!" : "Error");
  }
  return (
    <>
      <form id="contact" onSubmit={onSubmit}>
        <input name="email" placeholder="Email" />
        <textarea name="message" placeholder="Message" />
        <button className="btn" type="submit" style={{ background: "#6b5cff", color: "#fff" }}>
          Send
        </button>
      </form>
      <p id="sent">{sent}</p>
    </>
  );
}
