export type Theme = {
  id: string;
  name: string;
  dark: boolean;
  bg: string;
  side: string;
  main: string;
  pill: string;
  vibe: string;
};

export const THEMES: Theme[] = [
  { id: "elera", name: "Elera Light", dark: false, bg: "#F6F5F3", side: "#F6F5F3", main: "#FFFFFF", pill: "#7CD56E", vibe: "The default. Warm paper and a single green." },
  { id: "pebble-dark", name: "Pebble Dark", dark: true, bg: "#161614", side: "#161614", main: "#1F1F1D", pill: "#7CD56E", vibe: "Charcoal stone, same calm green." },
  { id: "midnight", name: "Midnight", dark: true, bg: "#0B1020", side: "#0B1020", main: "#111730", pill: "#5AD8A6", vibe: "Deep navy for late sessions." },
  { id: "nord", name: "Nord", dark: true, bg: "#2E3440", side: "#2E3440", main: "#3B4252", pill: "#A3BE8C", vibe: "Arctic, muted, familiar." },
  { id: "forest", name: "Forest", dark: true, bg: "#101610", side: "#101610", main: "#172017", pill: "#8FD97A", vibe: "Moss and pine after dusk." },
  { id: "rose", name: "Rose", dark: false, bg: "#FBF3F4", side: "#FBF3F4", main: "#FFFFFF", pill: "#E8849B", vibe: "Soft blush, gentle on the eyes." },
  { id: "ocean", name: "Ocean", dark: false, bg: "#F1F6F8", side: "#F1F6F8", main: "#FFFFFF", pill: "#2EB5A0", vibe: "Sea glass and morning air." },
  { id: "mono", name: "Mono", dark: false, bg: "#F4F4F4", side: "#F4F4F4", main: "#FFFFFF", pill: "#1A1A1A", vibe: "Ink on paper. Nothing else." },
  { id: "sunset", name: "Sunset", dark: false, bg: "#FBF4EF", side: "#FBF4EF", main: "#FFFFFF", pill: "#F08A4B", vibe: "Golden hour, all day." },
  { id: "candy", name: "Candy", dark: false, bg: "#F5F2FB", side: "#F5F2FB", main: "#FFFFFF", pill: "#9E7BFF", vibe: "Lavender with a little sugar." },
  { id: "coffee", name: "Coffee", dark: false, bg: "#F3EEE8", side: "#F3EEE8", main: "#FFFFFF", pill: "#B08954", vibe: "Oat milk and roasted beans." },
  { id: "slate", name: "Slate", dark: true, bg: "#181B20", side: "#181B20", main: "#20242B", pill: "#8FA3BF", vibe: "Cool graphite, quiet blue." },
  { id: "neon", name: "Neon", dark: true, bg: "#0C0C0F", side: "#0C0C0F", main: "#141419", pill: "#5EF38C", vibe: "Black glass, electric green." },
];

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];
