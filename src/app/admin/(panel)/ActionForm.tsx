"use client";
import { useActionState, type ReactNode } from "react";
import { Notice } from "@/components/ui/Notice";
import type { ActionResult } from "@/lib/types";

/** Small wrapper: a form bound to a server action that shows its result. */
export function ActionForm({ action, hidden, children, className = "" }: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  hidden: Record<string, string>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={`flex flex-col gap-2 ${className}`}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      {state && (state.ok ? <Notice tone="success">{state.message}</Notice> : <Notice tone="error">{state.error}</Notice>)}
    </form>
  );
}
