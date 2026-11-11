"use client";
import { useActionState, useState } from "react";
import { updateProfile } from "./actions";
import { AvatarPicker } from "@/components/AvatarPicker";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import type { ActionResult } from "@/lib/types";

export function ProfileEditor({ avatar, nickname, bio }: { avatar: string; nickname: string; bio: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(avatar);
  const [state, action] = useActionState<ActionResult | null, FormData>(updateProfile, null);

  if (!open) {
    return (
      <div className="space-y-2">
        {state?.ok && <Notice tone="success">{state.message}</Notice>}
        <Button variant="lavender" size="sm" onClick={() => setOpen(true)}>Ret min profil</Button>
      </div>
    );
  }
  return (
    <form action={async (fd) => { await action(fd); setOpen(false); }} className="sticker flex flex-col gap-4 p-4">
      <AvatarPicker value={value} onChange={setValue} />
      <input type="hidden" name="avatar" value={value} />
      <Field label="Kunstnernavn" htmlFor="nickname">
        <Input id="nickname" name="nickname" defaultValue={nickname} maxLength={24} required />
      </Field>
      <Field label="Lidt om dig (frivilligt)" htmlFor="bio" hint="Højst 140 tegn. Ingen navne, skole eller kontaktinfo.">
        <Textarea id="bio" name="bio" defaultValue={bio} maxLength={140} />
      </Field>
      {state && !state.ok && <Notice tone="error">{state.error}</Notice>}
      <div className="flex gap-2">
        <SubmitButton size="sm">Gem</SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Fortryd</Button>
      </div>
    </form>
  );
}
