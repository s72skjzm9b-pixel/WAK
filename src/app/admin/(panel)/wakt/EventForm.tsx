"use client";
import { useActionState } from "react";
import { saveEvent } from "../actions";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import type { ActionResult } from "@/lib/types";

export type EventFormValues = {
  id?: string; title?: string; description?: string; starts_at?: string; ends_at?: string; registration_deadline?: string;
  meeting_point?: string; address?: string; organizer_name?: string; organizer_email?: string; organizer_phone?: string;
  capacity?: number; practical_info?: string; status?: string;
};

export function EventForm({ values = {} }: { values?: EventFormValues }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(saveEvent, null);
  return (
    <form action={action} className="sticker grid gap-4 p-5 md:grid-cols-2">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="md:col-span-2"><Field label="Titel" htmlFor="title"><Input id="title" name="title" required maxLength={80} defaultValue={values.title} /></Field></div>
      <Field label="Start" htmlFor="starts_at"><Input id="starts_at" name="starts_at" type="datetime-local" required defaultValue={values.starts_at} /></Field>
      <Field label="Slut" htmlFor="ends_at"><Input id="ends_at" name="ends_at" type="datetime-local" required defaultValue={values.ends_at} /></Field>
      <Field label="Tilmeldingsfrist" htmlFor="registration_deadline"><Input id="registration_deadline" name="registration_deadline" type="datetime-local" required defaultValue={values.registration_deadline} /></Field>
      <Field label="Antal pladser" htmlFor="capacity"><Input id="capacity" name="capacity" type="number" min={1} max={500} required defaultValue={values.capacity ?? 15} /></Field>
      <Field label="Mødested" htmlFor="meeting_point" hint="fx Foran hovedindgangen"><Input id="meeting_point" name="meeting_point" required defaultValue={values.meeting_point} /></Field>
      <Field label="Adresse" htmlFor="address"><Input id="address" name="address" defaultValue={values.address} /></Field>
      <Field label="Arrangør" htmlFor="organizer_name"><Input id="organizer_name" name="organizer_name" required defaultValue={values.organizer_name} /></Field>
      <Field label="Arrangør telefon (vises til forældre)" htmlFor="organizer_phone"><Input id="organizer_phone" name="organizer_phone" type="tel" defaultValue={values.organizer_phone} /></Field>
      <Field label="Arrangør e-mail (vises til forældre)" htmlFor="organizer_email"><Input id="organizer_email" name="organizer_email" type="email" defaultValue={values.organizer_email} /></Field>
      <Field label="Status" htmlFor="status">
        <select id="status" name="status" defaultValue={values.status ?? "draft"} className="min-h-13 rounded-2xl border-[2.5px] border-cobalt bg-paper px-4 text-lg">
          <option value="draft">Kladde (kun admin kan se)</option>
          <option value="published">Offentliggjort for medlemmer</option>
        </select>
      </Field>
      <div className="md:col-span-2"><Field label="Beskrivelse" htmlFor="description"><Textarea id="description" name="description" rows={5} defaultValue={values.description} /></Field></div>
      <div className="md:col-span-2"><Field label="Praktisk info" htmlFor="practical_info" hint="Madpakke, tøj, pris, transport…"><Textarea id="practical_info" name="practical_info" defaultValue={values.practical_info} /></Field></div>
      <div className="md:col-span-2"><Field label="Coverbillede" htmlFor="cover" hint="Undgå billeder med genkendelige børn."><Input id="cover" name="cover" type="file" accept="image/*" /></Field></div>
      <div className="md:col-span-2 flex flex-col gap-2">
        {state && !state.ok && <Notice tone="error">{state.error}</Notice>}
        {state?.ok && <Notice tone="success">{state.message}</Notice>}
        <SubmitButton size="lg" className="self-start">Gem tur</SubmitButton>
      </div>
    </form>
  );
}
