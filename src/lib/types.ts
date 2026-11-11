export type Role = "child" | "guardian" | "admin";
export type MembershipStatus = "pending_guardian" | "pending_admin" | "active" | "suspended" | "rejected";
export type ArtworkStatus = "pending" | "approved" | "rejected" | "removed";
export type EventStatus = "draft" | "published" | "cancelled";
export type RegistrationStatus = "pending_guardian" | "confirmed" | "waitlisted" | "declined" | "cancelled" | "expired";

export type Profile = {
  id: string;
  role: Role;
  status: MembershipStatus;
  nickname: string | null;
  avatar: string;
  bio: string | null;
  pending_nickname: string | null;
  pending_bio: string | null;
};

export type FeedItem = {
  id: string;
  title: string | null;
  description: string | null;
  image_path: string;
  thumb_path: string;
  width: number;
  height: number;
  approved_at: string;
  owner_id: string;
  owner_nickname: string;
  owner_avatar: string;
  is_mine: boolean;
};

export type Artwork = {
  id: string;
  owner_id: string;
  title: string | null;
  description: string | null;
  image_path: string;
  thumb_path: string;
  width: number;
  height: number;
  status: ArtworkStatus;
  moderation_note: string | null;
  created_at: string;
};

export type WaktEvent = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  meeting_point: string;
  address: string | null;
  cover_path: string | null;
  organizer_name: string;
  organizer_email: string | null;
  organizer_phone: string | null;
  capacity: number;
  registration_deadline: string;
  practical_info: string | null;
  status: EventStatus;
};

export type Registration = {
  id: string;
  event_id: string;
  child_id: string;
  status: RegistrationStatus;
  requested_at: string;
  expires_at: string;
  confirmed_at: string | null;
};

export type ReactionSummary = { artwork_id: string; emoji: string; total: number; mine: boolean };

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
