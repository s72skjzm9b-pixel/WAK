// Builds seed/workbook-snapshot.json from values read from the live workbook on 2026-11-16
// (via the Google Sheets connector during implementation). Text values are verbatim.
// Formula-driven cells are written as the values the Sheet displayed at capture.
import { writeFileSync } from 'node:fs';
const S = (t) => t; // marker for readability
const source = [
 ["G01","1. Coffee","Headline","Section-level only","Coffees in season","","Source wording","Online coffee","Eligible online markets","Coffee webshop","Mix only within compatible product group; market availability to confirm"],
 ["G02","1. Coffee","Headline","Section-level only","Rare, bright coffees","","Source wording","Online coffee","Eligible online markets","Coffee webshop","Mix only within compatible product group; market availability to confirm"],
 ["G03","1. Coffee","Headline","Section-level only","Explore our coffees","","Source wording","Online coffee","Eligible online markets","Coffee webshop","Mix only within compatible product group; market availability to confirm"],
 ["G04","1. Coffee","Headline","Section-level only","Coffees with a sense of place","","Source wording","Online coffee","Eligible online markets","Coffee webshop","Mix only within compatible product group; market availability to confirm"],
 ["G05","1. Coffee","Description","Section-level only","Sourced with the changing seasons, roasted to express their origins.","","Source wording","Online coffee","Eligible online markets","Coffee webshop","Mix only within compatible product group; market availability to confirm"],
 ["G06","1. Coffee","Description","Section-level only","A changing selection, reflecting the people and places behind each coffee.","","Source wording","Online coffee","Eligible online markets","Coffee webshop","Mix only within compatible product group; market availability to confirm"],
 ["G07","1. Coffee","Description","Section-level only","Each coffee carries the character of its origin and the work of its producer.","","Source wording","Online coffee","Eligible online markets","Coffee webshop","Mix only within compatible product group; market availability to confirm"],
 ["G08","1. Coffee","Description","Section-level only","Our selection follows the harvest. Our roasting brings each coffee’s character into focus.","","Source wording","Online coffee","Eligible online markets","Coffee webshop","Mix only within compatible product group; market availability to confirm"],
 ["G09","2. Subscription","Headline","Section-level only","Coffee subscription","","Source wording","Subscription","Eligible online markets","Subscription page","Mix only within compatible product group; market availability to confirm"],
 ["G10","2. Subscription","Headline","Section-level only","A seasonal coffee subscription","","Source wording","Subscription","Eligible online markets","Subscription page","Mix only within compatible product group; market availability to confirm"],
 ["G11","2. Subscription","Headline","Section-level only","Coffee through the seasons","","Source wording","Subscription","Eligible online markets","Subscription page","Mix only within compatible product group; market availability to confirm"],
 ["G12","2. Subscription","Headline","Section-level only","From harvest to your door","","Source wording","Subscription","Eligible online markets","Subscription page","Mix only within compatible product group; market availability to confirm"],
 ["G13","2. Subscription","Description","Section-level only","A changing selection of bright coffees, delivered throughout the year.","","Source wording","Subscription","Eligible online markets","Subscription page","Mix only within compatible product group; market availability to confirm"],
 ["G14","2. Subscription","Description","Section-level only","From one harvest to the next, follow the seasons with regular coffee deliveries.","","Source wording","Subscription","Eligible online markets","Subscription page","Mix only within compatible product group; market availability to confirm"],
 ["G15","2. Subscription","Description","Section-level only","Familiar producers and new discoveries, shared through a changing coffee subscription.","","Source wording","Subscription","Eligible online markets","Subscription page","Mix only within compatible product group; market availability to confirm"],
 ["G16","2. Subscription","Description","Section-level only","Selected for their character, roasted to express their origins. Our seasonal subscription.","","Source wording","Subscription","Eligible online markets","Subscription page","Mix only within compatible product group; market availability to confirm"],
 ["G17","3. Cafés","Headline","Section-level only","Visit La Cabra","","Source wording","Local café visit","Relevant café locations only","Relevant café page","Do not use for webshop-only intent; verify local offering"],
 ["G18","3. Cafés","Headline","Section-level only","Coffee, bread & pastries","","Source wording","Local café visit","Relevant café locations only","Relevant café page","Do not use for webshop-only intent; verify local offering"],
 ["G19","3. Cafés","Headline","Section-level only","Find La Cabra near you","","Source wording","Local café visit","Relevant café locations only","Relevant café page","Do not use for webshop-only intent; verify local offering"],
 ["G20","3. Cafés","Headline","Section-level only","Our cafés","","Source wording","Local café visit","Relevant café locations only","Relevant café page","Do not use for webshop-only intent; verify local offering"],
 ["G21","3. Cafés","Headline","Section-level only","La Cabra New York","","Source wording","Local café visit","New York only","Relevant café page","Do not use for webshop-only intent; verify local offering"],
 ["G22","3. Cafés","Description","Section-level only","A changing selection of coffees, served alongside bread and pastries.","","Source wording","Local café visit","Relevant café locations only","Relevant café page","Do not use for webshop-only intent; verify local offering"],
 ["G23","3. Cafés","Description","Section-level only","Sourced with the seasons, roasted to express their origins. Served in our cafés.","","Source wording","Local café visit","Relevant café locations only","Relevant café page","Do not use for webshop-only intent; verify local offering"],
 ["G24","3. Cafés","Description","Section-level only","Find your nearest café, with opening hours and directions.","","Source wording","Local café visit","Relevant café locations only","Relevant café page","Do not use for webshop-only intent; verify local offering"],
 ["G25","3. Cafés","Description","Section-level only","From our roastery to the café counter. Explore the coffees we are serving today.","","Source wording","Local café visit","Relevant café locations only","Relevant café page","Do not use for webshop-only intent; verify local offering"],
 ["G26","4. About / Brand-led","Headline","Section-level only","Born in Aarhus, Denmark","","Source wording","Shared brand support","Select per campaign context","Match customer intent","Preserve linked headline in column D; English edits need approval"],
 ["G27","4. About / Brand-led","Headline","Section-level only","We source with the seasons","","Source wording","Shared brand support","Select per campaign context","Match customer intent","Preserve linked headline in column D; English edits need approval"],
 ["G28","4. About / Brand-led","Headline","Section-level only","Roast to reveal","","Source wording","Shared brand support","Select per campaign context","Match customer intent","Preserve linked headline in column D; English edits need approval"],
 ["G29","4. About / Brand-led","Headline","Section-level only","From Aarhus, outward","","Source wording","Shared brand support","Select per campaign context","Match customer intent","Preserve linked headline in column D; English edits need approval"],
 ["G30","4. About / Brand-led","Headline","Section-level only","The people behind the coffee","","Source wording","Shared brand support","Select per campaign context","Match customer intent","Preserve linked headline in column D; English edits need approval"],
 ["G31","4. About / Brand-led","Headline","Section-level only","Clarity in the cup","","Source wording","Shared brand support","Select per campaign context","Match customer intent","Preserve linked headline in column D; English edits need approval"],
 ["G32","4. About / Brand-led","Description","Born in Aarhus, Denmark","From our beginnings in Denmark to the producers and places that shape our selection today.","","Source wording","Shared brand support","Select per campaign context","Match customer intent","Preserve linked headline in column D; English edits need approval"],
 ["G33","4. About / Brand-led","Description","We source with the seasons","Fresh harvests, familiar producers and new discoveries along the way.","","Source wording","Shared brand support","Select per campaign context","Match customer intent","Preserve linked headline in column D; English edits need approval"],
 ["G34","4. About / Brand-led","Description","We source with the seasons","Our coffee selection follows the harvest, changing as coffees arrive from different origins.","Our coffee selection follows the harvest as coffees arrive from different origins.","Shortened proposal needs review","Shared brand support","Select per campaign context","Match customer intent","Preserve linked headline in column D; English edits need approval"],
 ["G35","4. About / Brand-led","Description","Roast to reveal","Each coffee’s individual character, expressed through roasting.","","Source wording","Shared brand support","Select per campaign context","Match customer intent","Preserve linked headline in column D; English edits need approval"],
 ["G36","4. About / Brand-led","Description","Roast to reveal","Clarity in the cup. The character of the origin, variety and process coming through.","","Source wording","Shared brand support","Select per campaign context","Match customer intent","Preserve linked headline in column D; English edits need approval"],
 ["G37","4. About / Brand-led","Description","From Aarhus, outward","A journey that began in Denmark in 2011. Today, we roast in Copenhagen and New York.","","Source wording","Shared brand support","Select per campaign context","Match customer intent","Preserve linked headline in column D; English edits need approval"],
 ["G38","4. About / Brand-led","Description","From Aarhus, outward","Two roasteries, a shared approach. Coffees selected with the seasons and roasted for clarity.","Two roasteries, a shared approach. Seasonal coffees selected and roasted for clarity.","Shortened proposal needs review","Shared brand support","Select per campaign context","Match customer intent","Preserve linked headline in column D; English edits need approval"],
 ["G39","4. About / Brand-led","Description","The people behind the coffee","Before a coffee reaches our roastery, its character has been shaped by the work of its producer.","Before coffee reaches our roastery, its character is shaped by the work of its producer.","Shortened proposal needs review","Shared brand support","Select per campaign context","Match customer intent","Preserve linked headline in column D; English edits need approval"],
 ["G40","4. About / Brand-led","Description","The people behind the coffee","Growing, harvesting and processing. The work at origin shapes what we taste in the cup.","","Source wording","Shared brand support","Select per campaign context","Match customer intent","Preserve linked headline in column D; English edits need approval"],
 ["G41","4. About / Brand-led","Description","Clarity in the cup","Our roasting allows the origin, variety and process to come through.","","Source wording","Shared brand support","Select per campaign context","Match customer intent","Preserve linked headline in column D; English edits need approval"],
 ["G42","4. About / Brand-led","Description","Clarity in the cup","From aromatics to sweetness and texture, an expression of each coffee’s individual character.","Aromatics, sweetness and texture express each coffee’s individual character.","Shortened proposal needs review","Shared brand support","Select per campaign context","Match customer intent","Preserve linked headline in column D; English edits need approval"],
 ["G43","5. Short introductions","Short introduction","Section-level only","Sourced with the changing seasons, roasted to express their origins.","","Source wording","Shared introduction","Select per campaign context","Match customer intent","Format and destination not yet assigned"],
 ["G44","5. Short introductions","Short introduction","Section-level only","Rare, bright coffees, reflecting the people and places behind them.","","Source wording","Shared introduction","Select per campaign context","Match customer intent","Format and destination not yet assigned"],
 ["G45","5. Short introductions","Short introduction","Section-level only","Born in Aarhus, Denmark, in 2011. A continuing journey in coffee.","","Source wording","Shared introduction","Select per campaign context","Match customer intent","Format and destination not yet assigned"],
 ["G46","5. Short introductions","Short introduction","Section-level only","A curiosity for coffee, its origins and the people who shape it.","","Source wording","Shared introduction","Select per campaign context","Match customer intent","Format and destination not yet assigned"],
 ["G47","5. Short introductions","Short introduction","Section-level only","Roasting in Copenhagen and New York, with our beginnings in Aarhus, Denmark.","","Source wording","Shared introduction","Select per campaign context","Match customer intent","Format and destination not yet assigned"],
 ["G48","Shared brand — proposed","Headline","Unassigned","La Cabra","","Proposed addition — needs approval","Brand identification","All markets; name unchanged","Match customer intent","No automatic pinning; select per campaign"],
];
// id, DK, DE, note (DK/DE status are formulas; displayed value reproduced)
const tr = [
 ["G01","Kaffe i sæson","Kaffees der Saison",0],["G02","Sjældne, lyse kaffer","Seltene, helle Kaffees",1],["G03","Udforsk vores kaffer","Unsere Kaffees entdecken",0],["G04","Kaffe med præg af sit ophav","Kaffees mit Herkunft",0],
 ["G05","Indkøbt efter sæsonerne og ristet for at fremhæve oprindelsen.","Mit den Jahreszeiten bezogen, geröstet, um ihre Herkunft zum Ausdruck zu bringen.",0],
 ["G06","Et skiftende udvalg, der afspejler menneskene og stederne bag hver kaffe.","Eine wechselnde Auswahl, geprägt von den Menschen und Orten hinter jedem Kaffee.",0],
 ["G07","Hver kaffe bærer præg af sin oprindelse og producentens arbejde.","Jeder Kaffee trägt den Charakter seiner Herkunft und die Arbeit seiner Produzenten.",0],
 ["G08","Vores udvalg følger høsten. Vores ristning fremhæver hver kaffes karakter.","Unsere Auswahl folgt der Ernte. Unsere Röstung hebt den Charakter jedes Kaffees hervor.",0],
 ["G09","Kaffeabonnement","Kaffee-Abonnement",0],["G10","Kaffeabonnement efter sæson","Ein saisonales Kaffee-Abo",0],["G11","Kaffe gennem sæsonerne","Kaffee durch die Jahreszeiten",0],["G12","Fra høst til din dør","Von der Ernte zu dir",0],
 ["G13","Et skiftende udvalg af lyse kaffer, leveret gennem hele året.","Eine wechselnde Auswahl heller Kaffees, das ganze Jahr über geliefert.",1],
 ["G14","Følg sæsonerne fra høst til høst med regelmæssige kaffeleveringer.","Von Ernte zu Ernte: Folge den Jahreszeiten mit regelmäßigen Kaffeelieferungen.",0],
 ["G15","Kendte producenter og nye opdagelser i et skiftende kaffeabonnement.","Vertraute Produzenten und neue Entdeckungen in einem wechselnden Kaffee-Abonnement.",0],
 ["G16","Udvalgt for deres karakter, ristet for at vise deres ophav. Vores sæsonabonnement.","Nach Charakter ausgewählt, für ihre Herkunft geröstet. Unser saisonales Kaffee-Abo.",0],
 ["G17","Besøg La Cabra","La Cabra besuchen",0],["G18","Kaffe, brød og bagværk","Kaffee, Brot & Gebäck",0],["G19","Find La Cabra nær dig","La Cabra in deiner Nähe",0],["G20","Vores caféer","Unsere Cafés",0],["G21","La Cabra New York","La Cabra New York",0],
 ["G22","Et skiftende udvalg af kaffer, serveret sammen med brød og bagværk.","Eine wechselnde Auswahl an Kaffees, serviert mit Brot und Gebäck.",0],
 ["G23","Indkøbt efter sæsonen, ristet for at fremhæve oprindelsen. Serveret i vores caféer.","Saisonal bezogen, für ihre Herkunft geröstet. Serviert in unseren Cafés.",0],
 ["G24","Find din nærmeste café med åbningstider og vejvisning.","Finde dein nächstes Café mit Öffnungszeiten und Wegbeschreibung.",0],
 ["G25","Fra vores risteri til cafédisken. Udforsk de kaffer, vi serverer i dag.","Von unserer Rösterei an die Cafétheke. Entdecke die Kaffees, die wir heute servieren.",0],
 ["G26","Fra Aarhus, Danmark","Aus Aarhus, Dänemark",0],["G27","Vi indkøber efter sæsonen","Wir beziehen saisonal",0],["G28","Ristet for at fremhæve","Rösten, um zu offenbaren",0],["G29","Fra Aarhus, ud i verden","Von Aarhus in die Welt",0],["G30","Menneskene bag kaffen","Die Menschen hinter dem Kaffee",0],["G31","Klarhed i koppen","Klarheit in der Tasse",0],
 ["G32","Fra starten i Danmark til de producenter og steder, der former vores udvalg i dag.","Von unseren Anfängen in Dänemark zu den Produzenten und Orten, die unsere Auswahl prägen.",0],
 ["G33","Friske høster, kendte producenter og nye opdagelser undervejs.","Frische Ernten, vertraute Produzenten und neue Entdeckungen auf dem Weg.",0],
 ["G34","Vores udvalg følger høsten og skifter, når kaffer fra forskellige oprindelser ankommer.","Unsere Auswahl folgt der Ernte und wechselt mit Kaffees verschiedener Herkunft.",0],
 ["G35","Hver kaffes særlige karakter, udtrykt gennem ristningen.","Der individuelle Charakter jedes Kaffees, durch die Röstung zum Ausdruck gebracht.",0],
 ["G36","Klarhed i koppen. Oprindelse, sort og forarbejdning træder frem.","Klarheit in der Tasse. Herkunft, Varietät und Verarbeitung werden spürbar.",0],
 ["G37","En rejse, der begyndte i Danmark i 2011. I dag rister vi i København og New York.","Eine Reise, die 2011 in Dänemark begann. Heute rösten wir in Kopenhagen und New York.",0],
 ["G38","To risterier, samme tilgang. Kaffe udvalgt efter sæsonen og ristet med fokus på klarhed.","Zwei Röstereien, ein Ansatz. Saisonal ausgewählte Kaffees, für Klarheit geröstet.",0],
 ["G39","Før kaffen når vores risteri, er dens karakter formet af producentens arbejde.","Bevor Kaffee unsere Rösterei erreicht, prägt die Arbeit der Produzenten seinen Charakter.",0],
 ["G40","Dyrkning, høst og forarbejdning. Arbejdet ved oprindelsen former det, vi smager i koppen.","Anbau, Ernte und Verarbeitung am Ursprung prägen, was wir in der Tasse schmecken.",0],
 ["G41","Vores ristning lader oprindelse, sort og forarbejdning træde frem.","Unsere Röstung lässt Herkunft, Varietät und Verarbeitung zum Ausdruck kommen.",0],
 ["G42","Fra aroma til sødme og tekstur – et udtryk for hver kaffes særlige karakter.","Aromen, Süße und Textur: ein Ausdruck des individuellen Charakters jedes Kaffees.",0],
 ["G43","","",2],["G44","","",2],["G45","","",2],["G46","","",2],["G47","","",2],
 ["G48","La Cabra","La Cabra",3],
];
const NOTES = ["Preserve source meaning and any linked headline; review natural local wording.","Agree meaning of bright; current translation may suggest roast colour.","Not yet translated; select use and format first","Brand name unchanged; not assigned to campaigns and no pinning agreed."];

const src = {}; source.forEach(r => src[r[0]] = r);
const pad = (n) => Array.from({ length: n }, () => []);

const sourceGrid = [["Source copy — authoritative wording"],["47 original lines preserved, plus proposed G48 La Cabra. Columns I–L define intent and usage; shortened proposals remain separate."],[],
 ["SOURCE ID","THEME","TYPE","LINKED HEADLINE","ORIGINAL COPY","CHARACTERS","SHORTENED PROPOSAL — REVIEW","STATUS","CUSTOMER INTENT","PERMITTED SCOPE","DESTINATION TYPE","USAGE / APPROVAL RULE"],
 ...source.map(r => [r[0],r[1],r[2],r[3],r[4],String(r[4].length),r[5],r[6],r[7],r[8],r[9],r[10]])];

const trGrid = [["Translation review — linked English foundation"],["All local wording remains draft. Approve English meaning and pairings first; re-review translations after any source change."],[],
 ["SOURCE ID","COPY FAMILY","ENGLISH SOURCE","DANISH DRAFT","DK APPROVAL","GERMAN DRAFT","DE APPROVAL","MEANING / REVIEW NOTE"],
 ...tr.map(([id, dk, de, n]) => [id, src[id][1], src[id][4], dk, dk ? "Needs translation approval" : "Not yet translated", de, de ? "Needs translation approval" : "Not yet translated", NOTES[n]])];

const refsFor = (id, lang) => {
  const n = Number(id.slice(1));
  if (lang === 'EN') return "Source library; see Campaign map and source ID in campaign tabs";
  if (n <= 8) return lang === 'DK' ? "DK_PMX_NCA, DK_SNO_Branded" : "DE_SNO_Branded, DE_PMX_NCA";
  if (n <= 16) return lang === 'DK' ? "DK_SNO_Branded" : "DE_SNO_Branded";
  if (n === 21) return "Not assigned to a local campaign";
  if (n <= 25) return lang === 'DK' ? "DK_PMX_Local, DK_SNO_Branded" : "DE_SNO_Branded";
  if (n <= 42) return lang === 'DK' ? "DK_SNO_Branded" : "DE_SNO_Branded";
  return "Not assigned to a local campaign";
};
const crGrid = [["Change reference — saved comparison, not a live-ad inventory"],["Edit wording only in Source copy E or Translation review D/F. C/E are saved values. I/J record exact approved wording; do not enter formulas. After application, paste current D/F as values into C/E to clear the row. Today’s initial snapshot is not confirmed live."],[],
 ["SOURCE ID","LANGUAGE","PREVIOUS WORDING","CURRENT WORDING","ENGLISH AT REFERENCE","CURRENT ENGLISH","TEXT CHANGE","TRANSLATION CHECK","APPROVED REPLACEMENT — PASTE VALUE","APPROVED ENGLISH — PASTE VALUE","ACTION","CAMPAIGN REFERENCES"]];
for (const [id, dk, de] of tr) for (const lang of ['EN','DK','DE']) {
  const cur = lang === 'EN' ? src[id][4] : lang === 'DK' ? dk : de;
  const en = src[id][4];
  crGrid.push([id, lang, cur, cur, en, en, "Unchanged", lang === 'EN' ? "Not applicable" : "Source unchanged", "", "", "No pending change", refsFor(id, lang)]);
}
const updatesGrid = [["Updates for Anabelle — automatic before / after"],["Only changed wording or translations affected by an English edit appear below. This is a comparison with the saved reference, not proof of live-ad differences. Approval and application remain deliberate manual steps."],[], crGrid[3], ["No changes since the saved reference"]];

const campaignMap = [["Campaign map — intent, scope and decisions"],["Planning structure only. Market names come from campaign tabs; actual targeting, URLs and settings require Anabelle's confirmation."],[],
 ["CAMPAIGN / WORKSTREAM","CUSTOMER INTENT","MARKET / LANGUAGE","DESTINATION","ALLOWED SOURCE COPY","COMBINATION / PINNING RULE","APPROVAL / NEXT DECISION"],
 ["US_PMX_Evergreen","Buy coffee online","US / English; targeting unverified","Confirm market-specific coffee shop URL","Coffee G01–G08; compatible brand support only","PMax: compatible assets within each group; no Search-style pins","Needs campaign scope, URL and English-copy review"],
 ["US_PMX_NCA","Buy coffee online","US / English; targeting unverified","Confirm market-specific coffee shop URL","Coffee G01–G08; compatible brand support only","PMax: compatible assets within each group; no Search-style pins","Needs campaign scope, URL and English-copy review"],
 ["NY_PMX_Local","Find / visit a café","NY / English; targeting unverified","Confirm exact café URL","Cafés G17–G25; NY-only G21","PMax: compatible assets within each group; no Search-style pins","Needs campaign scope, URL and English-copy review"],
 ["US_DG_Conversions","Subscription acquisition — confirm","US / English; targeting unverified","Confirm subscription URL","Subscription G09–G16 — proposed","Demand Gen: validate format and selected assets separately","Needs campaign scope, URL and English-copy review"],
 ["US_SNO_Branded","Brand search — separate shopping and local intent","US / English; targeting unverified","Separate local / shop destinations; URLs pending","Select by intent: Coffee G01–08; Subscription G09–16; local Cafés only where relevant; paired Brand G26–42","Search: pinning undecided; preserve fixed pairs in separate ads","Needs campaign scope, URL and English-copy review"],
 ["DK_PMX_NCA","Buy coffee online","DK / Danish draft; targeting unverified","Confirm market-specific coffee shop URL","Coffee G01–G08; compatible brand support only","PMax: compatible assets within each group; no Search-style pins","Needs campaign scope, URL and English-copy review; translation approval pending"],
 ["DK_PMX_Local","Find / visit a café","DK / Danish draft; targeting unverified","Confirm exact café URL","Cafés G17–G20 + G22–G25; exclude G21","PMax: compatible assets within each group; no Search-style pins","Needs campaign scope, URL and English-copy review; translation approval pending"],
 ["DK_SNO_Branded","Brand search — separate shopping and local intent","DK / Danish draft; targeting unverified","Separate local / shop destinations; URLs pending","Select by intent: Coffee G01–08; Subscription G09–16; local Cafés only where relevant; paired Brand G26–42","Search: pinning undecided; preserve fixed pairs in separate ads","Needs campaign scope, URL and English-copy review; translation approval pending"],
 ["UK_SNO_Branded","Brand search — separate shopping and local intent","UK / English; targeting unverified","Separate local / shop destinations; URLs pending","Select by intent: Coffee G01–08; Subscription G09–16; local Cafés only where relevant; paired Brand G26–42","Search: pinning undecided; preserve fixed pairs in separate ads","Needs campaign scope, URL and English-copy review"],
 ["EU_SNO_Branded","Brand search — separate shopping and local intent","EU / English; targeting unverified","Separate local / shop destinations; URLs pending","Select by intent: Coffee G01–08; Subscription G09–16; local Cafés only where relevant; paired Brand G26–42","Search: pinning undecided; preserve fixed pairs in separate ads","Needs campaign scope, URL and English-copy review"],
 ["DE_SNO_Branded","Brand search — separate shopping and local intent","DE / German draft; targeting unverified","Separate local / shop destinations; URLs pending","Select by intent: Coffee G01–08; Subscription G09–16; local Cafés only where relevant; paired Brand G26–42","Search: pinning undecided; preserve fixed pairs in separate ads","Needs campaign scope, URL and English-copy review; translation approval pending"],
 ["UK_PMX_NCA","Buy coffee online","UK / English; targeting unverified","Confirm market-specific coffee shop URL","Coffee G01–G08; compatible brand support only","PMax: compatible assets within each group; no Search-style pins","Needs campaign scope, URL and English-copy review"],
 ["DE_PMX_NCA","Buy coffee online","DE / German draft; targeting unverified","Confirm market-specific coffee shop URL","Coffee G01–G08; compatible brand support only","PMax: compatible assets within each group; no Search-style pins","Needs campaign scope, URL and English-copy review; translation approval pending"],
 ["Christmas — campaign mapping pending","Buy Christmas product","Confirm markets / language / dates","Confirm product URL","New approved seasonal source needed","Separate product group; format not confirmed","Confirm product, stock, dates and delivery cutoffs"],
 ["Advent calendar — campaign mapping pending","Buy Advent calendar","Confirm markets / language / dates","Confirm product URL","New approved Advent source needed","Separate product group; format not confirmed","Confirm product, stock, dates and delivery cutoffs"]];

// Campaign tabs: A group, B type, C id. Copy column displayed as the formula result.
const range = (a, b, skip = []) => { const o = []; for (let i = a; i <= b; i++) if (!skip.includes(i)) o.push('G' + String(i).padStart(2, '0')); return o; };
const groupOf = (id) => { const n = Number(id.slice(1)); if (n <= 8) return "1. Coffee"; if (n <= 16) return "2. Subscription"; if (n <= 25) return "3. Cafés"; return "Brand — " + (src[id][2] === 'Headline' ? src[id][4] : src[id][3]); };
const EN_HDR = ["GROUP / SECTION","ASSET TYPE","SOURCE ID","CHRISTIAN SOURCE COPY","CHARS","SHORTENED PROPOSAL — REVIEW","ALTERNATIVE / TRANSLATION — REVIEW","STATUS","PAIRING / NEXT STEP"];
const loc = (L) => ["GROUP / SECTION","ASSET TYPE","SOURCE ID",(L==='DK'?"DANISH":"GERMAN")+" COPY — APPROVAL NEEDED","ENGLISH SOURCE","CHARS","ANABELLE ALTERNATIVE — REVIEW","APPROVAL STATUS","PAIRING / NEXT STEP"];
const trById = {}; tr.forEach(r => trById[r[0]] = r);
function tab(name, lang, ids, extra) {
  const rows = [[name],["Review Campaign map before using these assets. Existing pools are drafts; select by intent and destination. Pinning and live settings remain unverified."],[], lang === 'EN' ? EN_HDR : loc(lang)];
  for (const id of ids) {
    const s = src[id]; const g = groupOf(id); const brand = g.startsWith('Brand');
    const pairing = brand ? "Keep linked brand headline + descriptions together; incomplete group" : "Use only within this theme; final selection and destination need review";
    if (lang === 'EN') rows.push([g, s[2], id, s[4], String(s[4].length), s[5], "", "Mapping needs review", pairing]);
    else { const t = lang === 'DK' ? trById[id][1] : trById[id][2]; rows.push([g, s[2], id, t, s[4], String(t.length), "", "Needs translation approval", "Review translation, tone and terminology. " + pairing]); }
  }
  for (const e of extra || []) rows.push(e);
  return rows;
}
const brandIds = range(26, 42);
const orderedBrand = ["G26","G27","G28","G29","G30","G31","G32","G33","G34","G35","G36","G37","G38","G39","G40","G41","G42"];
const sno = [...range(1,16), ...range(17,25,[21]), ...orderedBrand];
const missingLH = ["Missing source asset","Long headline","","","","","","Needs source copy","No dedicated long headline supplied; do not substitute unapproved alternatives."];
const usSnoAlt = [
 ["Ad: Christimas Calendar","Headline","","","","","Christmas Coffee Calendar","Alternative needs review","Anabelle source US_SNO_Branded!B2. Independent proposal, not a matched replacement. Christmas source copy missing."],
 ["Ad: Christimas Calendar","Headline","","","","","24 Days of Coffee","Alternative needs review","Anabelle source US_SNO_Branded!B3. Independent proposal, not a matched replacement. Christmas source copy missing."],
 ["Ad: Christimas Calendar","Headline","","","","","A New Coffee Every Day","Alternative needs review","Anabelle source US_SNO_Branded!B4. Independent proposal, not a matched replacement. Christmas source copy missing."],
 ["Ad: Christimas Calendar","Headline","","","","","Coffee Countdown to Christmas","Alternative needs review","Anabelle source US_SNO_Branded!B5. Independent proposal, not a matched replacement. Christmas source copy missing."],
 ["Ad: Christimas Calendar","Headline","","","","","The Christmas Coffee Ritual","Alternative needs review","Anabelle source US_SNO_Branded!B6. Independent proposal, not a matched replacement. Christmas source copy missing."],
 ["Ad: Christimas Calendar","Headline","","","","","La Cabra Christmas Calendar","Alternative needs review","Anabelle source US_SNO_Branded!B7. Independent proposal, not a matched replacement. Christmas source copy missing."],
 ["Ad: Christimas Calendar","Long Headline","","","","","Discover 24 different coffees from a year of sourcing, one for each day.","Alternative needs review","Anabelle source US_SNO_Branded!B8. Independent proposal, not a matched replacement. Christmas source copy missing."],
 ["Ad: Christimas Calendar","Long Headline","","","","","Count down to Christmas with 24 coffees across origins, varieties and processes.","Alternative needs review","Anabelle source US_SNO_Branded!B9. Independent proposal, not a matched replacement. Christmas source copy missing."],
 ["Ad: Christimas Calendar","Long Headline","","","","","A new coffee every day, with flavour profiles that shift throughout the calendar.","Alternative needs review","Anabelle source US_SNO_Branded!B10. Independent proposal, not a matched replacement. Christmas source copy missing."],
 ["Ad: Christimas Calendar","Long Headline","","","","","Each coffee arrives as a ready-to-brew Single Serve. No equipment needed.","Alternative needs review","Anabelle source US_SNO_Branded!B11. Independent proposal, not a matched replacement. Christmas source copy missing."],
 ["Ad: Evergreen","Headline","","","","","Seasonal Coffees","Alternative needs review","Anabelle source US_SNO_Branded!B15. Independent proposal, not a matched replacement."],
 ["Ad: Evergreen","Headline","","","","","La Cabra","Alternative needs review","Anabelle source US_SNO_Branded!B16. Independent proposal, not a matched replacement."],
 ["Ad: Evergreen","Headline","","","","","For Your Daily Ritual","Alternative needs review","Anabelle source US_SNO_Branded!B17. Independent proposal, not a matched replacement."],
 ["Ad: Evergreen","Headline","","","","","Roasted With Intention","Alternative needs review","Anabelle source US_SNO_Branded!B18. Independent proposal, not a matched replacement."],
 ["Ad: Evergreen","Headline","","","","","Coffee For Your Daily Ritual","Alternative needs review","Anabelle source US_SNO_Branded!B19. Independent proposal, not a matched replacement."],
];
const dkLocalAlt = [missingLH,
 ["Original proposal","Headline","","","","","La Cabra","Unapproved translation","Anabelle source DK_PMX_Local!B2. Independent proposal, not a matched replacement."],
 ["Original proposal","Headline","","","","","Kaffe efter sæson","Unapproved translation","Anabelle source DK_PMX_Local!B3. Independent proposal, not a matched replacement."],
 ["Original proposal","Headline","","","","","Ristet i København","Unapproved translation","Anabelle source DK_PMX_Local!B4. Independent proposal, not a matched replacement."],
 ["Original proposal","Headline","","","","","Besøg vores caféer","Unapproved translation","Anabelle source DK_PMX_Local!B5. Independent proposal, not a matched replacement."],
 ["Original proposal","Long Headline","","","","","Sæsonkaffer udvalgt med omtanke for oprindelse og karakter.","Unapproved translation","Anabelle source DK_PMX_Local!B18. Independent proposal, not a matched replacement."],
 ["Original proposal","Description","","","","","Kaffe leveret til døren, når det passer dig. Fleksibelt og nemt.","Unapproved translation","Anabelle source DK_PMX_Local!B23. Independent proposal, not a matched replacement."],
 ["Original proposal","Description","","","","","Besøg vores caféer – eller fortsæt oplevelsen derhjemme.","Unapproved translation","Anabelle source DK_PMX_Local!B24. Independent proposal, not a matched replacement."]];

const tabs = {
  "Start here": { sheetId: 810001, values: [["Start here — choose your role"]] },
  "Ad examples": { sheetId: 810007, values: [["Ad examples — a quick introduction"]] },
  "Updates for Anabelle": { sheetId: 810008, values: updatesGrid },
  "Campaign map": { sheetId: 810005, values: campaignMap },
  "Proposed structure": { sheetId: 810004, values: [["Structure guide — implemented framework"]] },
  "Translation review": { sheetId: 810006, values: trGrid },
  "Source copy": { sheetId: 810002, values: sourceGrid },
  "PMax combinations": { sheetId: 810003, values: [["PMax combination explorer — illustrative text review"]] },
  "US_PMX_Evergreen": { sheetId: 0, values: tab("US_PMX_Evergreen", 'EN', range(1,8), [missingLH]) },
  "US_PMX_NCA": { sheetId: 973202736, values: tab("US_PMX_NCA", 'EN', range(1,8), [missingLH]) },
  "NY_PMX_Local": { sheetId: 1414011374, values: tab("NY_PMX_Local", 'EN', range(17,25), [missingLH]) },
  "US_DG_Conversions": { sheetId: 1171022234, values: tab("US_DG_Conversions", 'EN', range(9,16)) },
  "US_SNO_Branded": { sheetId: 1120265065, values: tab("US_SNO_Branded", 'EN', sno, usSnoAlt) },
  "DK_PMX_NCA": { sheetId: 1581979298, values: tab("DK_PMX_NCA", 'DK', range(1,8), [missingLH]) },
  "DK_PMX_Local": { sheetId: 461599427, values: tab("DK_PMX_Local", 'DK', range(17,25,[21]), dkLocalAlt) },
  "DK_SNO_Branded": { sheetId: 1338550892, values: tab("DK_SNO_Branded", 'DK', sno) },
  "UK_SNO_Branded": { sheetId: 1781816775, values: tab("UK_SNO_Branded", 'EN', sno) },
  "EU_SNO_Branded": { sheetId: 733265334, values: tab("EU_SNO_Branded", 'EN', sno) },
  "DE_SNO_Branded": { sheetId: 992854987, values: tab("DE_SNO_Branded", 'DE', sno) },
  "UK_PMX_NCA": { sheetId: 661637511, values: tab("UK_PMX_NCA", 'EN', range(1,8), [missingLH]) },
  "DE_PMX_NCA": { sheetId: 1506070878, values: tab("DE_PMX_NCA", 'DE', range(1,8), [missingLH]) },
  "Change reference": { sheetId: 810009, values: crGrid },
};
const out = {
  kind: "workbook-snapshot",
  spreadsheetId: "1Kt4x-vf3oDdrQplwE7yW6TrDfTvtm55mOJK3yCpWvFo",
  title: "La Cabra — Google Ads | Master Copy & Campaign Review",
  capturedAt: "2026-11-16T16:00:00Z",
  capturedBy: "Read-only capture during implementation (Google Sheets connector).",
  limitations: [
    "Real copy, but a point-in-time snapshot: refresh from the live Sheet once Google credentials are configured.",
    "Source copy, Translation review, Campaign map and campaign tab memberships (group / asset type / source ID) were read verbatim.",
    "Change reference C/E were not read cell-by-cell: at capture every row showed 'No pending change', so C equals current wording; E is recorded as current English.",
    "Anabelle's alternative proposals were captured for US_SNO_Branded and DK_PMX_Local only. Other tabs' alternatives appear after a live refresh.",
    "Start here, Ad examples, Proposed structure and PMax combinations are reference tabs; only their titles are stored here."
  ],
  tabs
};
writeFileSync(new URL('../seed/workbook-snapshot.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('rows: source', source.length, 'tr', tr.length, 'cr', crGrid.length - 4);
