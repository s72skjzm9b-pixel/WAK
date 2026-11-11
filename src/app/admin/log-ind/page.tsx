import type { Metadata } from "next";
import { PublicShell } from "@/components/shell/PublicShell";
import { AdminLoginForm } from "./AdminLoginForm";

export const metadata: Metadata = { title: "Admin – log ind" };

export default function AdminLoginPage() {
  return (
    <PublicShell>
      <h1 className="mb-4 text-5xl text-cobalt">WAK admin</h1>
      <AdminLoginForm />
    </PublicShell>
  );
}
