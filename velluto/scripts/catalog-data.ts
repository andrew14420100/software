// Demo catalog. All films are Blender Foundation open movies released under
// Creative Commons Attribution; synopses are original Velluto copy.
type M = { file: string; start: number; seconds: number; hdr?: boolean; intro?: [number, number] };
type Entry = {
  slug: string; type: "movie" | "series"; name: string; tagline: string; synopsis: string; year: number; maturity: string;
  credits: string; license: string; attribution: string; accent: string; featured?: boolean; genres: string[];
  media?: M; seasons?: { number: number; name: string; episodes: { name: string; synopsis: string; media: M }[] }[];
};

const BF = "Blender Foundation";

export const CATALOG: Entry[] = [
  {
    slug: "big-buck-bunny", type: "movie", name: "Big Buck Bunny", year: 2008, maturity: "T", accent: "#8fd16a", featured: true,
    tagline: "Una giornata di sole, tre piccoli disturbatori e un coniglio molto paziente.",
    synopsis: "Commedia animata ambientata in un prato in primavera. Titolo di riferimento della piattaforma: sorgente 4K e variante HDR10.",
    credits: "Regia: Sacha Goedegebure", license: "CC BY 3.0", attribution: `© 2008 ${BF} · peach.blender.org`, genres: ["animazione", "commedia"],
    media: { file: "bbb_sunflower_2160p_30fps_normal.mp4", start: 0, seconds: 90, hdr: true, intro: [0, 13] },
  },
  {
    slug: "sintel", type: "movie", name: "Sintel", year: 2010, maturity: "12", accent: "#e0794f", featured: true,
    tagline: "Un viaggio attraverso terre lontane alla ricerca di un amico perduto.",
    synopsis: "Fiaba fantasy animata sul legame tra una giovane viaggiatrice e una piccola creatura alata. Include sottotitoli in più lingue.",
    credits: "Regia: Colin Levy", license: "CC BY 3.0", attribution: `© 2010 ${BF} · durian.blender.org`, genres: ["fantasy", "avventura", "animazione"],
    media: { file: "sintel_1080p.mkv", start: 30, seconds: 120 },
  },
  {
    slug: "tears-of-steel", type: "movie", name: "Tears of Steel", year: 2012, maturity: "12", accent: "#5fb3d9", featured: true,
    tagline: "Un gruppo di scienziati tenta di riscrivere un momento del passato.",
    synopsis: "Cortometraggio di fantascienza con riprese dal vero ed effetti visivi, ambientato ad Amsterdam. Sottotitoli in italiano e inglese.",
    credits: "Regia: Ian Hubert", license: "CC BY 3.0", attribution: `© 2012 ${BF} · mango.blender.org`, genres: ["fantascienza", "tecnologia"],
    media: { file: "tos_720p.mov", start: 60, seconds: 120 },
  },
  {
    slug: "elephants-dream", type: "movie", name: "Elephants Dream", year: 2006, maturity: "T", accent: "#c9a0dc",
    tagline: "Due figure esplorano una macchina sconfinata e piena di stranezze.",
    synopsis: "Il primo open movie della storia: un racconto visionario fatto di ingranaggi, cavi e prospettive impossibili.",
    credits: "Regia: Bassam Kurdali", license: "CC BY 2.5", attribution: `© 2006 ${BF} · orange.blender.org`, genres: ["surreale", "animazione"],
    media: { file: "ed_1024.avi", start: 30, seconds: 120 },
  },
  {
    slug: "cronache-di-sintel", type: "series", name: "Cronache di Sintel", year: 2010, maturity: "12", accent: "#f0a35e",
    tagline: "Il film Sintel, rimontato in capitoli.",
    synopsis: "Adattamento a episodi di Sintel (CC BY 3.0), pensato per mostrare la riproduzione automatica, il salto dell'intro e la ripresa dal punto lasciato.",
    credits: "Basato su Sintel di Colin Levy", license: "CC BY 3.0 (adattamento)", attribution: `Adattato da Sintel © 2010 ${BF}`, genres: ["fantasy", "avventura"],
    seasons: [{ number: 1, name: "Stagione 1", episodes: [
      { name: "La partenza", synopsis: "Il viaggio ha inizio.", media: { file: "sintel_1080p.mkv", start: 0, seconds: 90, intro: [0, 10] } },
      { name: "Il mercato", synopsis: "Una sosta in città e nuovi indizi.", media: { file: "sintel_1080p.mkv", start: 240, seconds: 90, intro: [0, 6] } },
      { name: "La caverna", synopsis: "Il capitolo conclusivo.", media: { file: "sintel_1080p.mkv", start: 480, seconds: 90, intro: [0, 6] } },
    ] }],
  },
  {
    slug: "la-macchina", type: "series", name: "La Macchina", year: 2006, maturity: "T", accent: "#b48ad8",
    tagline: "Elephants Dream in due atti.",
    synopsis: "Adattamento a episodi di Elephants Dream (CC BY 2.5).",
    credits: "Basato su Elephants Dream di Bassam Kurdali", license: "CC BY 2.5 (adattamento)", attribution: `Adattato da Elephants Dream © 2006 ${BF}`, genres: ["surreale"],
    seasons: [{ number: 1, name: "Stagione 1", episodes: [
      { name: "Atto primo", synopsis: "L'ingresso nella macchina.", media: { file: "ed_1024.avi", start: 0, seconds: 90, intro: [0, 8] } },
      { name: "Atto secondo", synopsis: "Le stanze più profonde.", media: { file: "ed_1024.avi", start: 300, seconds: 90, intro: [0, 5] } },
    ] }],
  },
];
