import enPrompts from "./en/prompts.json";
import esPrompts from "./es/prompts.json";
import ptPrompts from "./pt/prompts.json";

export interface PromptBundle {
  cleanupPrompt: string;
  fullPrompt: string;
  dictionarySuffix: string;
  translatePrompt: string;
}

export const en: PromptBundle = enPrompts;
export const es: PromptBundle = esPrompts;
export const pt: PromptBundle = ptPrompts;

export const PROMPTS_BY_LOCALE = {
  en,
  es,
  pt,
} as const;
