// Translation dictionary. English is the source of truth; add a locale by
// adding a block here. Model facts (names, numbers) stay in the data layer and
// are not translated.

export const languages = { en: "English", es: "Español" } as const;
export const defaultLang: Lang = "en";
export type Lang = keyof typeof languages;

export const ui = {
  en: {
    "nav.models": "Models",
    "nav.devices": "Devices",
    "nav.compare": "Compare",
    "nav.tools": "Tools",
    "nav.rig": "Rig score",
    "nav.guides": "Guides",
    "nav.methodology": "Methodology",
    "hero.badge":
      "{models} models across text, image, video, audio · {devices} devices · validated {date}",
    "hero.title1": "Can I run this AI",
    "hero.title2": "model",
    "hero.locally": "locally?",
    "hero.sub":
      "Pick a model, pick your hardware. You get a yes or no, the memory math, the exact command, and which tool to actually use. Covers Mac, Windows, Linux, iOS, Android.",
    "home.popularModels": "Popular models",
    "home.popularHardware": "Popular hardware",
    "home.allModels": "All {n} models →",
    "home.allDevices": "All {n} devices →",
    "home.requirements": "Requirements →",
    "home.bestModels": "Best models →",
    "home.howItWorks": "How it works",
    "home.bestTool": "Best tool per platform",
    "home.fullGuide": "Full guide →",
    "home.faq": "Frequently asked",
    "home.power": "power",
    "home.estimatesNote": "Estimates, not guarantees. See how we calculate and our sources.",
    "footer.tagline":
      "Does your machine run it? Pick a model, pick your hardware, get a yes or no. Free, no account.",
    "footer.dataNote": "Data validated {date} from Ollama, HuggingFace and vendor specs.",
  },
  es: {
    "nav.models": "Modelos",
    "nav.devices": "Dispositivos",
    "nav.compare": "Comparar",
    "nav.tools": "Herramientas",
    "nav.rig": "Rig score",
    "nav.guides": "Guías",
    "nav.methodology": "Metodología",
    "hero.badge":
      "{models} modelos entre texto, imagen, video y audio · {devices} dispositivos · validado {date}",
    "hero.title1": "¿Puedo ejecutar este",
    "hero.title2": "modelo de IA",
    "hero.locally": "en local?",
    "hero.sub":
      "Elige un modelo y tu hardware. Te decimos si funciona, cuánta memoria necesita, el comando exacto y la mejor herramienta para tu plataforma: Mac, Windows, Linux, iOS o Android.",
    "home.popularModels": "Modelos populares",
    "home.popularHardware": "Hardware popular",
    "home.allModels": "Ver los {n} modelos →",
    "home.allDevices": "Ver los {n} dispositivos →",
    "home.requirements": "Requisitos →",
    "home.bestModels": "Mejores modelos →",
    "home.howItWorks": "Cómo funciona",
    "home.bestTool": "Mejor herramienta por plataforma",
    "home.fullGuide": "Guía completa →",
    "home.faq": "Preguntas frecuentes",
    "home.power": "avanzado",
    "home.estimatesNote":
      "Estimaciones, no garantías. Consulta cómo calculamos y nuestras fuentes.",
    "footer.tagline":
      "Comprueba si tu equipo puede ejecutar un modelo de IA en local, y qué herramienta usar, en Mac, Windows, Linux, iOS y Android. Gratis, sin registro.",
    "footer.dataNote":
      "Datos validados el {date} desde Ollama, HuggingFace y especificaciones de fabricantes.",
  },
} as const;

export type UIKey = keyof (typeof ui)["en"];
