"use client";
import { useState } from "react";
import { AvatarPicker } from "@/components/AvatarPicker";

export function AvatarPreview() {
  const [v, setV] = useState("mascot:lavender");
  return <AvatarPicker value={v} onChange={setV} />;
}
