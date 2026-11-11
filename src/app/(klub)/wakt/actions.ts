"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveChild } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { notifyGuardiansOfRequest, notifyRegistrationStatus, EVENT_FIELDS } from "@/lib/events";
import type { ActionResult, WaktEvent } from "@/lib/types";

const uuid = z.string().uuid();

export async function wantToJoin(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const eventId = uuid.safeParse(formData.get("eventId"));
  if (!eventId.success) return { ok: false, error: "Ugyldig tur" };
  const { supabase, profile } = await requireActiveChild();
  const { error } = await supabase.rpc("request_event_registration", { p_event: eventId.data });
  if (error) return { ok: false, error: friendlyError(error) };
  const { data: ev } = await supabase.from("events").select(EVENT_FIELDS).eq("id", eventId.data).single<WaktEvent>();
  if (ev) await notifyGuardiansOfRequest(profile.id, profile.nickname ?? "Dit barn", ev);
  revalidatePath(`/wakt/${eventId.data}`);
  revalidatePath("/wakt");
  return { ok: true };
}

export async function cancelMyRegistration(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const regId = uuid.safeParse(formData.get("registrationId"));
  if (!regId.success) return { ok: false, error: "Ugyldig tilmelding" };
  const { supabase } = await requireActiveChild();
  const { data, error } = await supabase.rpc("cancel_registration", { p_reg: regId.data });
  if (error) return { ok: false, error: friendlyError(error) };
  await notifyRegistrationStatus([regId.data], "cancelled");
  await notifyRegistrationStatus((data as string[]) ?? [], "confirmed");
  revalidatePath("/wakt", "layout");
  return { ok: true };
}
