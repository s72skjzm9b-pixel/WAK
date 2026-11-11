import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { EventForm } from "../EventForm";

export const metadata: Metadata = { title: "Ny WAKT · Admin" };

export default async function NewEventPage() {
  await requireAdmin();
  return (
    <>
      <h1 className="mb-6 text-4xl text-cobalt">Ny WAKT</h1>
      <EventForm />
    </>
  );
}
