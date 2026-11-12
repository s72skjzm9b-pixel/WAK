// Database security tests for WAK. Runs the real migrations on a throw-away
// PostgreSQL and checks, as each kind of user, what they can and cannot do.
//   npm run test:db
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startCluster } from "./cluster.mjs";

let cluster, pool;

// --- helpers -----------------------------------------------------------------
/** Run fn(client) inside a transaction as the given role / user. */
async function as(who, fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (who === "anon") {
      await client.query("set local role anon");
    } else if (who === "service") {
      await client.query("set local role service_role");
    } else {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: who, role: "authenticated" }),
      ]);
    }
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
const q = (who, sql, params) => as(who, (c) => c.query(sql, params));
const rows = async (who, sql, params) => (await q(who, sql, params)).rows;
async function rejects(promise, pattern) {
  await assert.rejects(promise, (e) => {
    if (pattern && !pattern.test(e.message)) {
      throw new Error(`expected error ${pattern} but got: ${e.message}`);
    }
    return true;
  });
}

let seq = 0;
async function authUser(email) {
  const id = randomUUID();
  await pool.query("insert into auth.users (id, email) values ($1, $2)", [id, email ?? `u${++seq}@test.invalid`]);
  return id;
}

/** Child through the whole membership flow up to the given status. */
async function makeChild(target = "active", { imageSharing = true, guardianId } = {}) {
  const id = await authUser();
  const n = ++seq;
  const token = `tok-${n}-${randomUUID()}`;
  const guardianEmail = `parent${n}@test.invalid`;
  await q("service", "select public.register_child($1,$2,'can:orange',$3,2014,$4,$5, now() + interval '7 days')", [
    id, `Kunstner${n}`, `kid${n}`, guardianEmail, token,
  ]);
  if (target === "pending_guardian") return { id };
  const gid = guardianId ?? (await authUser(guardianEmail));
  await q("service", "select public.guardian_confirm_application($1,$2,'Voksen Test',null,$3,'v1')", [
    token, gid, imageSharing,
  ]);
  if (target === "pending_admin") return { id, guardian: gid };
  await q(admin, "select public.admin_decide_membership($1, $2, null)", [id, target !== "rejected"]);
  if (target === "suspended") await q(admin, "select public.admin_set_member_status($1,'suspended',null)", [id]);
  return { id, guardian: gid };
}

async function upload(childId) {
  const key = randomUUID();
  const image = `${childId}/${key}.webp`;
  const thumb = `${childId}/${key}_thumb.webp`;
  return as(childId, async (c) => {
    await c.query("insert into storage.objects (bucket_id, name, owner) values ('artwork',$1,$3),('artwork',$2,$3)", [image, thumb, childId]);
    const r = await c.query(
      "insert into public.artworks (owner_id, title, image_path, thumb_path, width, height) values ($1,'Weird ting',$2,$3,800,600) returning id",
      [childId, image, thumb],
    );
    return { id: r.rows[0].id, image, thumb };
  });
}

async function makeEvent({ capacity = 2, deadlineOffset = "5 days", startOffset = "10 days" } = {}) {
  const r = await rows(admin, `insert into public.events (title, starts_at, ends_at, meeting_point, organizer_name, capacity, registration_deadline, status)
     values ('WAKT test', now() + $2::interval, now() + $2::interval + interval '3 hours', 'Foran museet', 'Mette', $1, now() + $3::interval, 'published')
     returning id`, [capacity, startOffset, deadlineOffset]);
  return r[0].id;
}

// --- fixtures ----------------------------------------------------------------
let admin, alice, bob, pendingG, pendingA, suspended, rejected, noShare;

before(async () => {
  cluster = await startCluster();
  pool = cluster.pool;
  admin = await authUser("admin@test.invalid");
  await pool.query("insert into public.profiles (id, role, status) values ($1,'admin','active')", [admin]);
  alice = await makeChild("active");
  bob = await makeChild("active");
  pendingG = await makeChild("pending_guardian");
  pendingA = await makeChild("pending_admin");
  suspended = await makeChild("suspended");
  rejected = await makeChild("rejected");
  noShare = await makeChild("active", { imageSharing: false });
});

after(async () => {
  await cluster?.stop();
});

const PUBLIC_TABLES = [
  "profiles", "child_private", "guardian_private", "guardian_children", "membership_applications",
  "consent_records", "artworks", "reactions", "content_reports", "events", "event_registrations",
  "audit_log", "deletion_requests",
];

// --- tests -------------------------------------------------------------------
describe("anonymous visitors", () => {
  test("cannot read any table", async () => {
    for (const t of PUBLIC_TABLES) {
      await rejects(q("anon", `select * from public.${t}`), /permission denied/);
    }
  });
  test("cannot call any function", async () => {
    await rejects(q("anon", "select * from public.gallery_feed()"), /permission denied/);
    await rejects(q("anon", "select public.request_event_registration(gen_random_uuid())"), /permission denied/);
    await rejects(q("anon", "select public.register_child(gen_random_uuid(),'x','can:orange','xxx',2014,'a@b.c','t',now())"), /permission denied/);
  });
  test("cannot see storage objects", async () => {
    const art = await upload(alice.id);
    await q(admin, "select public.admin_moderate_artwork($1,'approved',null)", [art.id]);
    assert.equal((await rows("anon", "select * from storage.objects")).length, 0);
  });
});

describe("membership", () => {
  test("pending, suspended and rejected children see no community data", async () => {
    const art = await upload(alice.id);
    await q(admin, "select public.admin_moderate_artwork($1,'approved',null)", [art.id]);
    await makeEvent();
    for (const kid of [pendingG, pendingA, suspended, rejected]) {
      assert.equal((await rows(kid.id, "select * from public.gallery_feed()")).length, 0, "feed");
      assert.equal((await rows(kid.id, "select * from public.artworks where owner_id <> $1", [kid.id])).length, 0, "artworks");
      assert.equal((await rows(kid.id, "select * from public.events")).length, 0, "events");
      assert.equal((await rows(kid.id, "select * from public.event_registrations")).length, 0, "registrations");
      assert.equal((await rows(kid.id, "select * from storage.objects where bucket_id='artwork'")).length, 0, "storage");
      assert.equal((await rows(kid.id, "select * from public.profiles where id <> $1", [kid.id])).length, 0, "profiles");
      await rejects(q(kid.id, "select public.request_event_registration(gen_random_uuid())"), /forbidden/);
    }
  });

  test("pending child cannot upload", async () => {
    await rejects(upload(pendingA.id), /row-level security/);
  });

  test("guardian approval moves child to pending_admin, admin activates", async () => {
    const kid = await makeChild("pending_admin");
    const [p] = await rows(kid.id, "select status from public.profiles where id = $1", [kid.id]);
    assert.equal(p.status, "pending_admin");
    await q(admin, "select public.admin_decide_membership($1,true,null)", [kid.id]);
    const [p2] = await rows(kid.id, "select status from public.profiles where id = $1", [kid.id]);
    assert.equal(p2.status, "active");
  });

  test("admin cannot activate a child still waiting for the guardian", async () => {
    await rejects(q(admin, "select public.admin_decide_membership($1,true,null)", [pendingG.id]), /not_pending_admin/);
  });

  test("a used or wrong token cannot be reused", async () => {
    await rejects(q("service", "select public.guardian_confirm_application('nope',gen_random_uuid(),'X',null,true,'v1')"), /invalid_token/);
  });

  test("expired guardian token is refused", async () => {
    const id = await authUser();
    await q("service", "select public.register_child($1,'Gammel','can:orange','gammel1',2014,'old@test.invalid','tok-old', now() - interval '1 minute')", [id]);
    const g = await authUser("old@test.invalid");
    await rejects(q("service", "select public.guardian_confirm_application('tok-old',$1,'X',null,true,'v1')", [g]), /token_expired/);
  });

  test("max 3 open applications per guardian email", async () => {
    for (let i = 0; i < 3; i++) {
      const id = await authUser();
      await q("service", "select public.register_child($1,$2,'can:orange',$3,2014,'spam@test.invalid',$4, now() + interval '1 day')", [id, `Spam${i}`, `spam${i}`, `spam-${i}`]);
    }
    const id = await authUser();
    await rejects(q("service", "select public.register_child($1,'Spam9','can:orange','spam9',2014,'SPAM@test.invalid','spam-9', now() + interval '1 day')", [id]), /too_many_pending/);
  });

  test("children and guardians cannot call admin functions", async () => {
    for (const who of [alice.id, alice.guardian]) {
      await rejects(q(who, "select public.admin_decide_membership($1,true,null)", [pendingA.id]), /forbidden/);
      await rejects(q(who, "select public.admin_set_member_status($1,'suspended',null)", [bob.id]), /forbidden/);
      await rejects(q(who, "select public.admin_moderate_artwork(gen_random_uuid(),'approved',null)"), /forbidden/);
      await rejects(q(who, "select public.admin_cancel_event(gen_random_uuid())"), /forbidden/);
    }
  });

  test("server-only functions cannot be called by signed-in users", async () => {
    await rejects(q(alice.id, "select public.register_child(gen_random_uuid(),'x','can:orange','xyz',2014,'a@b.c','t',now())"), /permission denied/);
    await rejects(q(alice.guardian, "select public.guardian_confirm_application('t',gen_random_uuid(),'X',null,true,'v1')"), /permission denied/);
    await rejects(q(alice.id, "select public.audit('x','y','z','{}')"), /permission denied/);
  });

  test("users cannot change their own role or status", async () => {
    await rejects(q(alice.id, "update public.profiles set role='admin' where id=$1", [alice.id]), /permission denied/);
    await rejects(q(pendingA.id, "update public.profiles set status='active' where id=$1", [pendingA.id]), /permission denied/);
    await rejects(q(alice.id, "insert into public.profiles (id, role, status) values (gen_random_uuid(),'admin','active')"), /permission denied/);
  });
});

describe("member privacy", () => {
  test("children cannot read other children's profiles, private data or guardian contacts", async () => {
    assert.equal((await rows(alice.id, "select * from public.profiles where id = $1", [bob.id])).length, 0);
    assert.equal((await rows(alice.id, "select * from public.child_private where child_id <> $1", [alice.id])).length, 0);
    assert.equal((await rows(alice.id, "select * from public.guardian_private")).length, 0);
    assert.equal((await rows(alice.id, "select * from public.consent_records")).length, 0);
    assert.equal((await rows(alice.id, "select * from public.audit_log")).length, 0);
  });

  test("a guardian sees their own child, not other children", async () => {
    assert.equal((await rows(alice.guardian, "select * from public.profiles where id = $1", [alice.id])).length, 1);
    assert.equal((await rows(alice.guardian, "select * from public.profiles where id = $1", [bob.id])).length, 0);
    assert.equal((await rows(alice.guardian, "select * from public.child_private where child_id = $1", [bob.id])).length, 0);
    assert.equal((await rows(alice.guardian, "select * from public.guardian_private where guardian_id <> $1", [alice.guardian])).length, 0);
  });

  test("a guardian cannot browse the community gallery", async () => {
    assert.equal((await rows(alice.guardian, "select * from public.gallery_feed()")).length, 0);
  });

  test("profile edits: avatar at once, nickname waits for admin", async () => {
    await q(bob.id, "select public.update_my_profile('eyes:cobalt','Ny Bob','hej')");
    let [p] = await rows(bob.id, "select nickname, avatar, pending_nickname, pending_bio from public.profiles where id=$1", [bob.id]);
    assert.equal(p.avatar, "eyes:cobalt");
    assert.equal(p.pending_nickname, "Ny Bob");
    assert.notEqual(p.nickname, "Ny Bob");
    await q(admin, "select public.admin_review_profile($1,true)", [bob.id]);
    [p] = await rows(bob.id, "select nickname, bio, pending_nickname from public.profiles where id=$1", [bob.id]);
    assert.equal(p.nickname, "Ny Bob");
    assert.equal(p.bio, "hej");
    assert.equal(p.pending_nickname, null);
  });
});

describe("artwork and moderation", () => {
  test("new uploads are shared straight away with active members only", async () => {
    const art = await upload(alice.id);
    const [mine] = await rows(alice.id, "select status, approved_at from public.artworks where id=$1", [art.id]);
    assert.equal(mine.status, "approved");
    assert.ok(mine.approved_at);
    const feed = await rows(bob.id, "select * from public.gallery_feed(null, 48, $1)", [art.id]);
    assert.equal(feed.length, 1);
    assert.equal(feed[0].owner_nickname.startsWith("Kunstner"), true);
    assert.equal((await rows(bob.id, "select * from storage.objects where name=$1", [art.image])).length, 1);
    // still invisible to the suspended / pending
    assert.equal((await rows(suspended.id, "select * from storage.objects where name=$1", [art.image])).length, 0);
    assert.equal((await rows(pendingA.id, "select * from storage.objects where name=$1", [art.image])).length, 0);
    assert.equal((await rows(pendingA.id, "select * from public.gallery_feed(null, 48, $1)", [art.id])).length, 0);
  });

  test("swiping neighbours follow gallery order and visibility", async () => {
    const a1 = await upload(alice.id);
    const a2 = await upload(alice.id);
    const a3 = await upload(alice.id);
    let [n] = await rows(bob.id, "select * from public.gallery_neighbors($1)", [a2.id]);
    assert.equal(n.newer, a3.id);
    assert.equal(n.older, a1.id);
    await q(admin, "select public.admin_moderate_artwork($1,'removed','test')", [a3.id]);
    [n] = await rows(bob.id, "select * from public.gallery_neighbors($1)", [a2.id]);
    assert.notEqual(n.newer, a3.id);
    assert.equal((await rows(suspended.id, "select * from public.gallery_neighbors($1)", [a2.id])).length, 0);
  });

  test("a parent can remove their own child's work, not others'", async () => {
    const kid = await makeChild("active");
    const art = await upload(kid.id);
    const other = await upload(alice.id);
    await rejects(q(kid.guardian, "select public.guardian_remove_artwork($1)", [other.id]), /forbidden/);
    await rejects(q(bob.id, "select public.guardian_remove_artwork($1)", [art.id]), /forbidden/);
    await q(kid.guardian, "select public.guardian_remove_artwork($1)", [art.id]);
    assert.equal((await rows(bob.id, "select * from public.gallery_feed(null,48,$1)", [art.id])).length, 0);
    const [a] = await rows(kid.id, "select status from public.artworks where id=$1", [art.id]);
    assert.equal(a.status, "removed");
    const [log] = await rows(admin, "select * from public.audit_log where action='artwork.removed_by_guardian' and target_id=$1", [art.id]);
    assert.ok(log);
  });

  test("feed never leaks private fields", async () => {
    const [row] = await rows(bob.id, "select * from public.gallery_feed() limit 1");
    for (const k of ["birth_year", "username", "email", "status", "moderation_note"]) {
      assert.equal(k in row, false, k);
    }
  });

  test("children cannot self-approve or upload into someone else's folder", async () => {
    await rejects(
      q(alice.id, "insert into public.artworks (owner_id, image_path, thumb_path, width, height, status) values ($1,$2,$3,1,1,'approved')",
        [alice.id, `${alice.id}/x.webp`, `${alice.id}/x_t.webp`]),
      /permission denied/,
    );
    await rejects(q(alice.id, "update public.artworks set status='approved' where owner_id=$1", [alice.id]), /permission denied/);
    await rejects(
      q(alice.id, "insert into storage.objects (bucket_id, name) values ('artwork',$1)", [`${bob.id}/evil.webp`]),
      /row-level security/,
    );
    await rejects(
      q(alice.id, "insert into public.artworks (owner_id, image_path, thumb_path, width, height) values ($1,'a/x.webp','a/y.webp',1,1)", [bob.id]),
      /row-level security/,
    );
  });

  test("children without image-sharing consent cannot upload", async () => {
    await rejects(upload(noShare.id), /row-level security/);
  });

  test("withdrawing image-sharing consent hides the child's art immediately", async () => {
    const kid = await makeChild("active");
    const art = await upload(kid.id);
    await q(admin, "select public.admin_moderate_artwork($1,'approved',null)", [art.id]);
    assert.equal((await rows(bob.id, "select * from public.gallery_feed(null,48,$1)", [art.id])).length, 1);
    await q(kid.guardian, "select public.guardian_set_consent($1,'image_sharing',false)", [kid.id]);
    assert.equal((await rows(bob.id, "select * from public.gallery_feed(null,48,$1)", [art.id])).length, 0);
    assert.equal((await rows(bob.id, "select * from storage.objects where name=$1", [art.image])).length, 0);
  });

  test("a child can delete their own artwork but not others'", async () => {
    const art = await upload(alice.id);
    const r1 = await q(bob.id, "delete from public.artworks where id=$1", [art.id]);
    assert.equal(r1.rowCount, 0);
    const r2 = await q(alice.id, "delete from public.artworks where id=$1", [art.id]);
    assert.equal(r2.rowCount, 1);
  });

  test("rejected and removed works disappear from the gallery", async () => {
    const art = await upload(alice.id);
    await q(admin, "select public.admin_moderate_artwork($1,'approved',null)", [art.id]);
    await q(admin, "select public.admin_moderate_artwork($1,'removed','test')", [art.id]);
    assert.equal((await rows(bob.id, "select * from public.gallery_feed(null,48,$1)", [art.id])).length, 0);
    const [mine] = await rows(alice.id, "select status, moderation_note from public.artworks where id=$1", [art.id]);
    assert.equal(mine.status, "removed");
  });
});

describe("reactions and reports", () => {
  test("add, change and remove a reaction; nobody sees who reacted", async () => {
    const art = await upload(alice.id);
    await q(admin, "select public.admin_moderate_artwork($1,'approved',null)", [art.id]);
    await q(bob.id, "insert into public.reactions (artwork_id, user_id, emoji) values ($1,$2,'🔥')", [art.id, bob.id]);
    await q(bob.id, "update public.reactions set emoji='🌀' where artwork_id=$1 and user_id=$2", [art.id, bob.id]);
    let sum = await rows(alice.id, "select * from public.reaction_summary(array[$1]::uuid[])", [art.id]);
    assert.deepEqual(sum.map((s) => [s.emoji, s.total]), [["🌀", 1]]);
    assert.equal((await rows(alice.id, "select * from public.reactions where artwork_id=$1", [art.id])).length, 0);
    await rejects(q(bob.id, "insert into public.reactions (artwork_id, user_id, emoji) values ($1,$2,'💩')", [art.id, alice.id]), /row-level security|check/);
    await q(bob.id, "delete from public.reactions where artwork_id=$1", [art.id]);
    sum = await rows(alice.id, "select * from public.reaction_summary(array[$1]::uuid[])", [art.id]);
    assert.equal(sum.length, 0);
  });

  test("cannot react to removed art or as a suspended member", async () => {
    const art = await upload(alice.id);
    await rejects(q(suspended.id, "insert into public.reactions (artwork_id, user_id, emoji) values ($1,$2,'🔥')", [art.id, suspended.id]), /row-level security/);
    await q(admin, "select public.admin_moderate_artwork($1,'removed',null)", [art.id]);
    await rejects(q(bob.id, "insert into public.reactions (artwork_id, user_id, emoji) values ($1,$2,'🔥')", [art.id, bob.id]), /row-level security/);
    await rejects(q(suspended.id, "insert into public.reactions (artwork_id, user_id, emoji) values ($1,$2,'🔥')", [art.id, suspended.id]), /row-level security/);
  });

  test("one report hides a work for everyone until an admin decides", async () => {
    const art = await upload(alice.id);
    await q(admin, "select public.admin_moderate_artwork($1,'approved',null)", [art.id]);
    const carl = await makeChild("active");
    assert.equal((await rows(carl.id, "select * from public.gallery_feed(null,48,$1)", [art.id])).length, 1);
    await q(bob.id, "insert into public.content_reports (artwork_id, reporter_id, reason) values ($1,$2,'personal_info')", [art.id, bob.id]);
    assert.equal((await rows(bob.id, "select * from public.gallery_feed(null,48,$1)", [art.id])).length, 0);
    // one report hides it for everyone until an admin has looked
    assert.equal((await rows(carl.id, "select * from public.gallery_feed(null,48,$1)", [art.id])).length, 0);
    await q(admin, "select public.admin_resolve_report(id,'dismissed',false) from public.content_reports where artwork_id=$1", [art.id]);
    assert.equal((await rows(carl.id, "select * from public.gallery_feed(null,48,$1)", [art.id])).length, 1);
    await q(carl.id, "insert into public.content_reports (artwork_id, reporter_id, reason) values ($1,$2,'unsafe')", [art.id, carl.id]);
    const dave = await makeChild("active");
    assert.equal((await rows(dave.id, "select * from public.gallery_feed(null,48,$1)", [art.id])).length, 0);
    // reporters can't see each other's reports
    assert.equal((await rows(carl.id, "select * from public.content_reports where artwork_id=$1", [art.id])).length, 1);
    const reports = await rows(admin, "select id from public.content_reports where artwork_id=$1", [art.id]);
    assert.equal(reports.length, 2);
    const [open] = await rows(admin, "select id from public.content_reports where artwork_id=$1 and status='open'", [art.id]);
    await q(admin, "select public.admin_resolve_report($1,'resolved',true)", [open.id]);
    const [a] = await rows(admin, "select status from public.artworks where id=$1", [art.id]);
    assert.equal(a.status, "removed");
  });
});

describe("WAKT registrations", () => {
  test("only published events are visible; drafts are admin-only", async () => {
    const [d] = await rows(admin, `insert into public.events (title, starts_at, ends_at, meeting_point, organizer_name, capacity, registration_deadline)
      values ('Hemmelig', now()+interval '9 days', now()+interval '9 days 2 hours', 'X', 'Y', 5, now()+interval '8 days') returning id`);
    assert.equal((await rows(alice.id, "select * from public.events where id=$1", [d.id])).length, 0);
    await rejects(q(alice.id, "select public.request_event_registration($1)", [d.id]), /not_found/);
    await rejects(q(alice.id, "insert into public.events (title, starts_at, ends_at, meeting_point, organizer_name, capacity, registration_deadline) values ('x', now(), now()+interval '1h','x','x',1, now())"), /row-level security/);
  });

  test("full flow: request → guardian approves → confirmed; other kids can't see it", async () => {
    const ev = await makeEvent({ capacity: 5 });
    const reg = (await rows(alice.id, "select public.request_event_registration($1) as id", [ev]))[0].id;
    await rejects(q(alice.id, "select public.request_event_registration($1)", [ev]), /already_registered/);
    assert.equal((await rows(bob.id, "select * from public.event_registrations where event_id=$1", [ev])).length, 0);
    await rejects(q(bob.guardian, "select public.guardian_decide_registration($1,true)", [reg]), /forbidden/);
    await rejects(q(alice.id, "select public.guardian_decide_registration($1,true)", [reg]), /forbidden/);
    const [d] = await rows(alice.guardian, "select public.guardian_decide_registration($1,true) as s", [reg]);
    assert.equal(d.s, "confirmed");
    const [mine] = await rows(alice.id, "select status from public.event_registrations where id=$1", [reg]);
    assert.equal(mine.status, "confirmed");
    const [av] = await rows(bob.id, "select * from public.event_availability(array[$1]::uuid[])", [ev]);
    assert.equal(av.spaces_left, 4);
    const consent = await rows(alice.guardian, "select * from public.consent_records where event_id=$1", [ev]);
    assert.equal(consent.length, 1);
  });

  test("concurrent approvals never exceed capacity", async () => {
    const ev = await makeEvent({ capacity: 2 });
    const kids = [];
    for (let i = 0; i < 6; i++) kids.push(await makeChild("active"));
    const regs = [];
    for (const k of kids) regs.push((await rows(k.id, "select public.request_event_registration($1) as id", [ev]))[0].id);
    const results = await Promise.all(
      kids.map((k, i) => rows(k.guardian, "select public.guardian_decide_registration($1,true) as s", [regs[i]])),
    );
    const statuses = results.map((r) => r[0].s);
    assert.equal(statuses.filter((s) => s === "confirmed").length, 2);
    assert.equal(statuses.filter((s) => s === "waitlisted").length, 4);
    const [c] = await rows(admin, "select count(*)::int as n from public.event_registrations where event_id=$1 and status='confirmed'", [ev]);
    assert.equal(c.n, 2);

    // a confirmed child cancels → first waitlisted child is promoted
    const confirmedIdx = statuses.indexOf("confirmed");
    const [p] = await rows(kids[confirmedIdx].id, "select public.cancel_registration($1) as promoted", [regs[confirmedIdx]]);
    assert.equal(p.promoted.length, 1);
    const [c2] = await rows(admin, "select count(*)::int as n from public.event_registrations where event_id=$1 and status='confirmed'", [ev]);
    assert.equal(c2.n, 2);

    // admin raises capacity → waitlist fills automatically
    await q(admin, "update public.events set capacity = 4 where id=$1", [ev]);
    const [c3] = await rows(admin, "select count(*)::int as n from public.event_registrations where event_id=$1 and status='confirmed'", [ev]);
    assert.equal(c3.n, 4);
  });

  test("an unanswered request expires", async () => {
    const ev = await makeEvent({ capacity: 5 });
    const kid = await makeChild("active");
    const reg = (await rows(kid.id, "select public.request_event_registration($1) as id", [ev]))[0].id;
    await pool.query("update public.event_registrations set expires_at = now() - interval '1 second' where id=$1", [reg]);
    const [d] = await rows(kid.guardian, "select public.guardian_decide_registration($1,true) as s", [reg]);
    assert.equal(d.s, "expired");
    // the child may ask again
    const again = await rows(kid.id, "select public.request_event_registration($1) as id", [ev]);
    assert.equal(again.length, 1);
  });

  test("no requests after the registration deadline", async () => {
    const ev = await makeEvent({ deadlineOffset: "-1 hour", startOffset: "2 days" });
    await rejects(q(alice.id, "select public.request_event_registration($1)", [ev]), /deadline_passed/);
  });

  test("guardian can decline; admin can cancel the whole event", async () => {
    const ev = await makeEvent({ capacity: 3 });
    const kid = await makeChild("active");
    const reg = (await rows(kid.id, "select public.request_event_registration($1) as id", [ev]))[0].id;
    const [d] = await rows(kid.guardian, "select public.guardian_decide_registration($1,false) as s", [reg]);
    assert.equal(d.s, "declined");
    const reg2 = (await rows(alice.id, "select public.request_event_registration($1) as id", [ev]))[0].id;
    await q(alice.guardian, "select public.guardian_decide_registration($1,true)", [reg2]);
    const [n] = await rows(admin, "select public.admin_cancel_event($1) as n", [ev]);
    assert.equal(n.n, 1);
    const [r] = await rows(alice.id, "select status from public.event_registrations where id=$1", [reg2]);
    assert.equal(r.status, "cancelled");
  });
});

describe("guardian controls and deletion", () => {
  test("withdrawing membership consent suspends the child at once", async () => {
    const kid = await makeChild("active");
    await q(kid.guardian, "select public.guardian_set_consent($1,'membership',false)", [kid.id]);
    const [p] = await rows(admin, "select status from public.profiles where id=$1", [kid.id]);
    assert.equal(p.status, "suspended");
    assert.equal((await rows(kid.id, "select * from public.gallery_feed()")).length, 0);
    await rejects(q(bob.guardian, "select public.guardian_set_consent($1,'membership',true)", [kid.id]), /forbidden/);
  });

  test("deletion request suspends; deleting the auth user removes all child data", async () => {
    const kid = await makeChild("active");
    const art = await upload(kid.id);
    const [r] = await rows(kid.guardian, "select public.guardian_request_deletion($1,'child_account',null) as id", [kid.id]);
    const [p] = await rows(admin, "select status from public.profiles where id=$1", [kid.id]);
    assert.equal(p.status, "suspended");
    await q(admin, "select public.admin_mark_deletion($1,'completed')", [r.id]);
    await pool.query("delete from auth.users where id=$1", [kid.id]);
    for (const [t, col] of [["profiles", "id"], ["child_private", "child_id"], ["artworks", "owner_id"], ["consent_records", "child_id"], ["guardian_children", "child_id"], ["membership_applications", "child_id"]]) {
      const { rows: left } = await pool.query(`select 1 from public.${t} where ${col}=$1`, [kid.id]);
      assert.equal(left.length, 0, t);
    }
    assert.equal((await pool.query("select 1 from public.artworks where id=$1", [art.id])).rows.length, 0);
  });

  test("admin actions are written to the audit log", async () => {
    const log = await rows(admin, "select action from public.audit_log");
    const actions = new Set(log.map((l) => l.action));
    for (const a of ["membership.approved", "artwork.approved", "registration.confirmed", "event.created", "deletion.completed"]) {
      assert.ok(actions.has(a), a);
    }
  });
});
