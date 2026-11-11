import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo, Sticker } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Blob, Spark } from "@/components/ui/Blob";
import { Field, Input, Checkbox } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Avatar } from "@/components/ui/Avatar";
import { StatusPill } from "@/components/ui/StatusPill";
import { DateSticker } from "@/components/ui/DateSticker";
import { PageTitle, EmptyState } from "@/components/ui/PageTitle";
import { BottomNav } from "@/components/ui/BottomNav";
import { ArtCard } from "@/components/ArtCard";
import { EventCard } from "@/app/(klub)/wakt/EventCard";
import { NextWaktHero } from "@/app/(klub)/wakt/NextWaktHero";
import { ReactionBar } from "@/app/(klub)/kunst/ReactionBar";
import { AvatarPreview } from "./AvatarPreview";
import { SAMPLE_ART, SAMPLE_EVENTS } from "./samples";

export const metadata: Metadata = { title: "Stilguide" };

// Design-system reference with sample content. Only available in development
// (or with WAK_ENABLE_STYLEGUIDE=1); returns 404 in production.
export default function StyleGuide() {
  if (process.env.NODE_ENV === "production" && process.env.WAK_ENABLE_STYLEGUIDE !== "1") notFound();
  const colors = [
    { name: "Kobolt", hex: "#1015B9", cls: "bg-cobalt text-cream" },
    { name: "Orange", hex: "#FF6500", cls: "bg-orange text-cobalt-deep" },
    { name: "Creme", hex: "#FFF7E9", cls: "bg-cream text-cobalt" },
    { name: "Lavendel", hex: "#C8B4EB", cls: "bg-lavender text-cobalt" },
  ];
  return (
    <div className="paper-grain min-h-dvh pb-32">
      <div className="mx-auto max-w-5xl space-y-14 px-4 py-8">
        <header className="flex flex-wrap items-center gap-6">
          <Logo variant="badge" className="w-36" />
          <div>
            <p className="font-hand text-2xl text-orange">designsystem</p>
            <h1 className="text-6xl text-cobalt">WAK stilguide</h1>
          </div>
        </header>

        <section id="farver">
          <h2 className="mb-4 text-3xl text-cobalt">Farver</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {colors.map((c) => (
              <div key={c.name} className={`sticker flex aspect-square flex-col justify-end rounded-full p-6 ${c.cls}`}>
                <p className="font-display text-2xl font-semibold">{c.name}</p>
                <p className="font-mono text-sm">{c.hex}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="typografi" className="space-y-3">
          <h2 className="text-3xl text-cobalt">Typografi</h2>
          <p className="text-7xl font-display text-cobalt">Weird, Art, Klub</p>
          <p className="font-hand text-3xl text-orange">håndskrevet accent – kickers og små kommentarer</p>
          <p className="max-w-xl text-lg">Brødtekst i Fredoka: runde, venlige bogstaver der er lette at læse for børn. Korte sætninger. Store knapper.</p>
          <div className="flex flex-wrap items-center gap-6">
            <Logo variant="wordmark" className="w-64" />
            <div className="rounded-3xl bg-cobalt p-4"><Logo variant="wordmark-cream" className="w-56" /></div>
          </div>
        </section>

        <section id="knapper" className="space-y-4">
          <h2 className="text-3xl text-cobalt">Knapper</h2>
          <div className="flex flex-wrap gap-4">
            <Button>Log ind</Button>
            <Button variant="orange" size="lg">Jeg vil med!</Button>
            <Button variant="lavender">Billeder</Button>
            <Button variant="ghost">Fortryd</Button>
            <Button variant="danger" size="sm">Slet</Button>
          </div>
        </section>

        <section id="stickers">
          <h2 className="mb-4 text-3xl text-cobalt">Stickers og former</h2>
          <div className="flex flex-wrap items-center gap-6">
            {["sticker-can", "sticker-eyes", "sticker-peace", "sticker-star", "mascot", "sticker-wak", "sticker-weird-art-klub"].map((s) => <Sticker key={s} name={s} className="h-24 w-auto" />)}
            <Blob className="size-24" fill="fill-cobalt" />
            <Blob className="size-24" fill="fill-orange" lobes={6} wobble={0.12} />
            <Spark className="size-24 text-cobalt" fill="fill-lavender" />
          </div>
        </section>

        <section id="elementer" className="grid gap-8 md:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-3xl text-cobalt">Felter og beskeder</h2>
            <Field label="Kunstnernavn" htmlFor="sg-nick" hint="Det kan de andre se."><Input id="sg-nick" placeholder="fx Blå Banan" /></Field>
            <Field label="Brugernavn" htmlFor="sg-user" error="Det brugernavn er taget – prøv et andet"><Input id="sg-user" defaultValue="banan" /></Field>
            <Checkbox label="Der er ingen ansigter, navne eller adresser på billedet." defaultChecked />
            <Notice tone="success" title="Din kunst er sendt til WAK!">Vi kigger lige på dit værk, før det kommer i galleriet.</Notice>
            <Notice tone="error" title="Ups!">Billedet er for stort. Prøv et mindre billede.</Notice>
          </div>
          <div className="space-y-4">
            <h2 className="text-3xl text-cobalt">Status, datoer, figurer</h2>
            <div className="flex flex-wrap gap-2">
              {["pending_guardian", "pending_admin", "active", "suspended", "pending", "approved", "confirmed", "waitlisted"].map((s) => <StatusPill key={s} status={s} />)}
            </div>
            <div className="flex gap-4">
              <DateSticker iso={SAMPLE_EVENTS[0].starts_at} />
              <DateSticker iso={SAMPLE_EVENTS[1].starts_at} tone="lavender" />
              <DateSticker iso={SAMPLE_EVENTS[2].starts_at} tone="cobalt" />
            </div>
            <div className="flex flex-wrap gap-3">
              {["can:lavender", "eyes:orange", "peace:cream", "star:cobalt", "mascot:lavender", "wak:orange"].map((a) => <Avatar key={a} value={a} size="md" />)}
            </div>
            <AvatarPreview />
            <ReactionBar artworkId="00000000-0000-0000-0000-000000000000" initialCounts={{ "🔥": 4, "🌀": 2, "👀": 1 }} initialMine="🔥" readOnly />
          </div>
        </section>

        <section id="skaerme">
          <h2 className="mb-6 text-3xl text-cobalt">Skærme (eksempelindhold)</h2>
          <div className="grid gap-10 lg:grid-cols-2">
            <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[2.5rem] border-[6px] border-ink bg-cream">
              <div className="p-4">
                <PageTitle kicker="nyeste fra klubben">KUNST</PageTitle>
                <ul className="columns-2 gap-4">
                  {SAMPLE_ART.map((a, i) => (
                    <li key={i}>
                      <ArtCard index={i} href="#" src={a.src} title={a.title} nickname={a.nickname} avatar={a.avatar} width={a.w} height={a.h} counts={a.counts} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[2.5rem] border-[6px] border-ink bg-cream">
              <div className="p-4">
                <PageTitle kicker="weird art klub tur">WAKT</PageTitle>
                <NextWaktHero ev={SAMPLE_EVENTS[0]} />
                <h3 className="mb-3 font-hand text-2xl text-cobalt">kommende</h3>
                <ul className="space-y-4">
                  <li><EventCard ev={SAMPLE_EVENTS[1]} href="#" spacesLeft={4} /></li>
                  <li><EventCard ev={SAMPLE_EVENTS[2]} href="#" myStatus="pending_guardian" /></li>
                </ul>
              </div>
            </div>
            <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[2.5rem] border-[6px] border-ink bg-cream p-4">
              <PageTitle kicker="det er dig!">MIN WAK</PageTitle>
              <section className="sticker flex flex-col items-center gap-3 bg-lavender p-6 text-center">
                <Avatar value="can:orange" size="xl" className="bg-cream" />
                <p className="font-display text-4xl text-cobalt">Blå Banan</p>
                <p>Jeg samler mærkelige sten og tegner monstre.</p>
              </section>
            </div>
            <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[2.5rem] border-[6px] border-ink bg-cream p-4">
              <PageTitle kicker="vis os noget weird!">UPLOAD</PageTitle>
              <EmptyState title="Galleriet er tomt… endnu!">Vær den første til at vise os noget weird.</EmptyState>
            </div>
          </div>
        </section>
      </div>
      <BottomNav />
    </div>
  );
}
