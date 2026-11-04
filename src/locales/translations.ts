import enTranslation from "./en/translation.json";
import esTranslation from "./es/translation.json";
import ptTranslation from "./pt/translation.json";

export const TRANSLATIONS_BY_LOCALE = {
  en: enTranslation,
  es: esTranslation,
  pt: ptTranslation,
} as const;
