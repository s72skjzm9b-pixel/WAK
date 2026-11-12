"use client";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAvatar, updateProfile } from "./actions";
import { AvatarPicker } from "@/components/AvatarPicker";
import { Avatar } from "@/components/ui/Avatar";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import type { ActionResult } from "@/lib/types";

/**
 * The "det er dig" card. The figure changes the moment you tap a new one
 * (and is saved straight away – it's always one of WAK's own drawings).
 * Name and text still need "Gem", because WAK looks at those first.
 */
export function ProfileCard({ avatar, nickname, bio, pendingNickname, pendingBio }: {
  avatar: string; nickname: string; bio: string | null; pendingNickname: string | null; pendingBio: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(avatar);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [state, action] = useActionState<ActionResult | null, FormData>(updateProfile, null);

  function pickAvatar(next: string) {
    const prev = value;
    setValue(next);
    setAvatarError(null);
    startTransition(async () => {
      const res = await setAvatar(next);
      if (!res.ok) {
        setValue(prev);
        setAvatarError(res.error);
      } else {
        router.refresh(); // update the little figure in the top bar too
      }
    });
  }

  return (
    <section className="sticker relative mb-8 flex flex-col items-center gap-3 overflow-hidden bg-lavender p-6 text-center">
      <Avatar key={value} value={value} size="xl" className="bg-cream motion-safe:animate-pop" />
      <h2 className="text-4xl text-cobalt">{nickname}</h2>
      {bio && <p className="max-w-sm text-lg">{bio}</p>}
      {(pendingNickname || pendingBio) && <p className="rounded-full bg-cream px-3 py-1 text-sm">WAK kigger på dine ændringer</p>}

      {!open ? (
        <div className="space-y-2">
          {state?.ok && <Notice tone="success">{state.message}</Notice>}
          <Button variant="lavender" size="sm" className="bg-cream" onClick={() => setOpen(true)}>Ret min profil</Button>
        </div>
      ) : (
        <div className="sticker flex w-full flex-col gap-4 p-4 text-left">
          <div className="space-y-1">
            <AvatarPicker value={value} onChange={pickAvatar} />
            <p className="text-sm text-ink-soft">Din figur skifter med det samme.</p>
            {avatarError && <p className="text-sm font-semibold text-danger" role="alert">{avatarError}</p>}
          </div>
          <form action={async (fd) => { await action(fd); setOpen(false); }} className="flex flex-col gap-4">
            <Field label="Kunstnernavn" htmlFor="nickname">
              <Input id="nickname" name="nickname" defaultValue={pendingNickname ?? nickname} maxLength={24} required />
            </Field>
            <Field label="Lidt om dig (frivilligt)" htmlFor="bio" hint="Højst 140 tegn. Ingen navne, skole eller kontaktinfo.">
              <Textarea id="bio" name="bio" defaultValue={pendingBio ?? bio ?? ""} maxLength={140} />
            </Field>
            {state && !state.ok && <Notice tone="error">{state.error}</Notice>}
            <div className="flex gap-2">
              <SubmitButton size="sm">Gem navn og tekst</SubmitButton>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Luk</Button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
