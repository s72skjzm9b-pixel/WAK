import type { Metadata } from "next";
import { PublicShell } from "@/components/shell/PublicShell";
import { Notice } from "@/components/ui/Notice";

export const metadata: Metadata = { title: "Privatliv" };

// DRAFT privacy information. Must be reviewed by a lawyer / DPO before launch.
// Items in [brackets] must be filled in by WAK.
export default function PrivacyPage() {
  return (
    <PublicShell wide>
      <h1 className="mb-4 text-5xl text-cobalt">Sådan passer vi på data</h1>
      <Notice tone="warn" title="Udkast">
        Denne tekst er et udkast og skal gennemgås juridisk, før WAK åbner for rigtige medlemmer.
      </Notice>

      <div className="mt-6 space-y-6 text-lg [&_h2]:mb-2 [&_h2]:text-3xl [&_h2]:text-cobalt [&_li]:ml-5 [&_li]:list-disc">
        <section>
          <h2>Kort fortalt (til børn)</h2>
          <ul>
            <li>Andre medlemmer kan kun se dit kunstnernavn, din tegnede figur, din korte tekst og den kunst, WAK har godkendt.</li>
            <li>Ingen kan se din alder, dit rigtige navn, din skole eller din voksens kontaktinfo.</li>
            <li>Der er ingen reklamer, og vi sælger aldrig noget om dig.</li>
            <li>Du kan altid bede din voksen om at slette din konto.</li>
          </ul>
        </section>

        <section>
          <h2>Hvem står for data?</h2>
          <p>[WAK – Weird Art Klub, juridisk enhed, CVR, adresse, kontakt-e-mail]. Dataansvarlig kontakt: [navn/e-mail].</p>
        </section>

        <section>
          <h2>Hvad gemmer vi?</h2>
          <ul>
            <li><b>Barnet:</b> kunstnernavn, brugernavn, kodeord (krypteret), fødselsår, valgt figur, kort tekst, uploadede billeder med titel/beskrivelse, emoji-reaktioner, tilmeldinger til ture.</li>
            <li><b>Forælder/værge:</b> navn, e-mail, evt. telefon, samtykker og svar på turforespørgsler.</li>
            <li><b>Sikkerhed:</b> en log over vigtige handlinger (fx godkendelser) for at kunne dokumentere, hvad der er sket.</li>
          </ul>
          <p className="mt-2">Billeder bliver gemt igen uden metadata – placering (GPS), kameraoplysninger og tidspunkter fjernes, før de gemmes.</p>
        </section>

        <section>
          <h2>Hvorfor og på hvilket grundlag?</h2>
          <p>
            For at drive en lukket kunstklub og arrangere ture. Grundlaget er samtykke fra forælder/værge (databeskyttelsesforordningen art. 6, stk. 1, litra a og art. 8, jf. databeskyttelsesloven § 6, stk. 2).
            Deling af billeder i galleriet er et separat samtykke, som kan trækkes tilbage når som helst. [Skal vurderes juridisk – fx om nogle dele i stedet bør bygge på andet grundlag.]
          </p>
        </section>

        <section>
          <h2>Hvem kan se hvad?</h2>
          <ul>
            <li>Godkendte medlemmer: kunstnernavn, figur, kort tekst og godkendt kunst.</li>
            <li>Forælder/værge: alt om eget barn.</li>
            <li>WAK-administratorer: det, der er nødvendigt for at godkende, moderere og arrangere ture.</li>
            <li>Deltagerlister til ture vises aldrig til andre børn.</li>
          </ul>
        </section>

        <section>
          <h2>Databehandlere</h2>
          <p>Supabase (database, login og privat billedlager – [EU-region]), Vercel (hosting – [region]), [e-mailudbyder]. Der er [databehandleraftaler] med alle.</p>
        </section>

        <section>
          <h2>Hvor længe?</h2>
          <p>
            Så længe barnet er medlem. Afviste anmodninger slettes [straks/inden 30 dage]. Ved sletning fjernes konto, billeder, reaktioner og tilmeldinger.
            Sikkerhedsloggen gemmes i [X måneder] uden navne. [Endelige frister fastsættes før lancering.]
          </p>
        </section>

        <section>
          <h2>Dine rettigheder</h2>
          <p>
            Du kan få indsigt, rettet eller slettet data, trække samtykke tilbage og klage til Datatilsynet (datatilsynet.dk).
            Forældre kan gøre det meste direkte på forældresiden.
          </p>
        </section>
      </div>
    </PublicShell>
  );
}
