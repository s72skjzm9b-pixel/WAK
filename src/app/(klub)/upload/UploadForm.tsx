"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { uploadArtwork } from "./actions";
import { Field, Input, Textarea, Checkbox } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Button, ButtonLink, buttonClass } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Sticker } from "@/components/ui/Logo";
import { IconCamera, IconImage } from "@/components/ui/Icons";
import type { ActionResult } from "@/lib/types";

const MAX_SIDE = 2400;

/** Shrinks the photo in the browser so uploads are fast (the server re-encodes again). */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 3_000_000 && file.type !== "image/heic") return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    return blob ? new File([blob], "kunst.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export function UploadForm() {
  const [state, action] = useActionState<ActionResult | null, FormData>(uploadArtwork, null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    const small = await shrink(f);
    const dt = new DataTransfer();
    dt.items.add(small);
    if (fileRef.current) fileRef.current.files = dt.files;
    setPreview(URL.createObjectURL(small));
    setBusy(false);
    e.target.value = "";
  }

  if (state?.ok) {
    return (
      <div className="sticker flex flex-col items-center gap-3 p-8 text-center">
        <Sticker name="sticker-peace" className="h-28 w-auto motion-safe:animate-wiggle" />
        <h2 className="text-4xl text-cobalt">Din kunst er i galleriet!</h2>
        <p className="text-lg">Nu kan de andre i klubben se den og give den emojis.</p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/kunst" variant="orange">Se galleriet</ButtonLink>
          <a href="/upload" className={buttonClass("ghost")}>Del mere</a>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      {state && !state.ok && <Notice tone="error" title="Ups!">{state.error}</Notice>}

      <input ref={fileRef} type="file" name="image" accept="image/*" className="hidden" />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={pick} />

      {preview ? (
        <div className="sticker relative p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview blob */}
          <img src={preview} alt="Dit billede" className="max-h-[50dvh] w-full rounded-xl object-contain" />
          <Button type="button" variant="cream" size="sm" className="absolute right-4 top-4" onClick={() => setPreview(null)}>
            Skift
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5 rounded-[2rem] border-[3px] border-dashed border-cobalt bg-paper px-4 py-10 text-center">
          <IconImage className="size-14 text-cobalt" />
          <p className="font-display text-xl text-cobalt">{busy ? "Gør billedet klar…" : "Vælg billede eller tag et foto"}</p>
          <div className="flex gap-3">
            <Button type="button" size="lg" onClick={() => cameraRef.current?.click()} aria-label="Tag et foto">
              <IconCamera className="size-7" /> Foto
            </Button>
            <Button type="button" variant="lavender" size="lg" onClick={() => galleryRef.current?.click()} aria-label="Vælg fra dine billeder">
              <IconImage className="size-7" /> Billeder
            </Button>
          </div>
        </div>
      )}

      <Field label="Titel (frivillig)" htmlFor="title">
        <Input id="title" name="title" maxLength={60} placeholder="fx Bananen der drømte" />
      </Field>
      <Field label="Fortæl om det (frivilligt)" htmlFor="description" hint="Hvad er det? Hvor fandt du det?">
        <Textarea id="description" name="description" maxLength={300} />
      </Field>

      <Checkbox
        required
        name="safe"
        label="Der er ingen ansigter, navne, adresser, skolelogoer eller andet, der kan afsløre hvem nogen er."
      />

      <SubmitButton variant="orange" size="lg" disabled={!preview} pendingLabel="Deler…">
        Del i galleriet
      </SubmitButton>
    </form>
  );
}
