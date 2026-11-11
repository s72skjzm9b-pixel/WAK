"use client";
import { useFormStatus } from "react-dom";
import { Button } from "./Button";
import type { ComponentProps } from "react";

/** Submit button that shows a busy label while the server action runs. */
export function SubmitButton({ children, pendingLabel = "Et øjeblik…", ...props }: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
