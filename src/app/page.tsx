import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer, homeFor } from "@/lib/auth";
import { Logo, Sticker } from "@/components/ui/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { Blob, Spark } from "@/components/ui/Blob";
import { Burst } from "@/components/ui/Burst";

export default async function Home() {
  const viewer = await getViewer();
  if (viewer?.profile) redirect(homeFor(viewer.profile));

  return (
    <div className="min-h-dvh overflow-x-hidden">
      {/* Hero */}
      <section className="relative bg-cobalt px-4 pb-16 pt-6 text-cream">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between">
            <Logo variant="letters-cream" className="w-24" />
            <Link href="/log-ind" className="rounded-full border-2 border-cream px-4 py-2 font-display font-semibold">
              Log ind
            </Link>
          </div>
          <div className="mt-8 grid items-center gap-8 md:grid-cols-[1.1fr_1fr]">
            <div>
              <p className="font-hand text-2xl text-lavender">en lukket kunstklub for børn på 10–13 år</p>
              <h1 className="mt-2 text-6xl leading-[0.95] sm:text-7xl">
                Weird,
                <br />
                Art,
                <br />
                <span className="text-orange">Klub</span>
              </h1>
              <p className="mt-5 max-w-sm text-xl">Del din kunst. Opdag noget weird. Tag med på tur.</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <ButtonLink href="/bliv-medlem" variant="orange" size="lg">
                  Bliv medlem
                </ButtonLink>
                <ButtonLink href="/log-ind" variant="cream" size="lg">
                  Log ind
                </ButtonLink>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-sm">
              <Blob className="absolute inset-0 size-full" fill="fill-lavender" lobes={9} />
              <Logo variant="badge" priority className="relative w-full p-6 motion-safe:animate-[float_6s_ease-in-out_infinite]" />
            </div>
          </div>
        </div>
      </section>

      {/* What is WAK */}
      <section className="paper-grain px-4 py-14">
        <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-3">
          {[
            { title: "KUNST", text: "Del billeder af kunst, du har lavet eller fundet. Reagér med emojis – ingen likes, ingen konkurrence.", sticker: "sticker-can", tone: "bg-paper" },
            { title: "WAKT", text: "Weird Art Klub Tur: museer, gadekunst, værksteder og weirde steder. Altid med din voksens ja.", sticker: "mascot", tone: "bg-lavender" },
            { title: "KLUBBEN", text: "Kun godkendte medlemmer kan se noget. Ingen reklamer. Ingen fremmede. Ingen beskeder.", sticker: "sticker-eyes", tone: "bg-orange" },
          ].map((c, i) => (
            <article key={c.title} className={`sticker ${c.tone} p-6 ${i === 1 ? "md:rotate-1" : i === 2 ? "md:-rotate-1" : ""}`}>
              <Sticker name={c.sticker} className="h-20 w-auto" />
              <h2 className="mt-3 flex items-center gap-1 text-3xl text-cobalt">
                <Burst className="size-6 text-cobalt" />
                {c.title}
              </h2>
              <p className="mt-2 text-lg text-ink">{c.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* For grown-ups */}
      <section className="bg-lavender px-4 py-14">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 md:flex-row md:items-center">
          <Spark className="size-24 shrink-0 text-cobalt" fill="fill-cream" />
          <div className="flex-1">
            <h2 className="text-4xl text-cobalt">Til de voksne</h2>
            <p className="mt-2 max-w-xl text-lg">
              Et barn kan kun blive medlem, når en forælder eller værge har givet samtykke, og en voksen fra WAK har godkendt det.
              Alle billeder bliver set af WAK, før andre kan se dem, og ture kræver altid din tilladelse.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <ButtonLink href="/voksen/log-ind" variant="primary">Forældreside</ButtonLink>
              <ButtonLink href="/privatliv" variant="ghost">Sådan passer vi på data</ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
