// Contenido y diseño de la página: se leen de Supabase, con respaldo
// en la memoria del navegador (caché) y en config.js
(function () {
  const D = window.SITE_DEFAULTS, db = window.db;

  // Tipografías disponibles (nombre -> parámetro de Google Fonts)
  const FONTS = {
    "Inter": "Inter:wght@400;500;600;700;800",
    "Poppins": "Poppins:wght@400;500;600;700;800",
    "Montserrat": "Montserrat:wght@400;500;600;700;800",
    "DM Sans": "DM+Sans:wght@400;500;600;700;800",
    "Oswald": "Oswald:wght@400;500;600;700",
    "Bebas Neue": "Bebas+Neue",
    "Playfair Display": "Playfair+Display:wght@400;600;700;800",
  };

  const RADIUS = {
    round: ["16px", "12px", "999px"],
    soft: ["12px", "10px", "12px"],
    square: ["4px", "4px", "6px"],
  };

  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

  // Combina los valores por defecto con los guardados (los guardados ganan)
  function merge(base, over) {
    if (over === undefined) return base;
    if (!isObj(base) || !isObj(over)) return over;
    const out = { ...base };
    for (const k of Object.keys(over)) out[k] = merge(base[k], over[k]);
    return out;
  }

  // localStorage puede fallar (modo incógnito, bloqueado): nunca rompe la página
  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
  };

  // Qué tan claro es un color (0 = negro, 1 = blanco) y contraste entre dos colores
  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  // Filas de la tabla working_hours -> { 0: [], 1: [["10:00","21:00"]], ... }
  function groupHours(rows) {
    const h = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const r of rows) h[r.weekday].push([r.opens.slice(0, 5), r.closes.slice(0, 5)]);
    return h;
  }

  const Site = {
    FONTS, merge, store, luminance, contrast,
    content: null,
    services: null,
    hours: null,
    settings: null,
    preview: false,

    // Leer un valor con ruta, ej: Site.get("hero.title")
    get(path, obj = this.content) {
      return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
    },

    // Lo primero que se muestra: caché del navegador o valores por defecto
    init() {
      const cache = store.get("xh_cache") || {};
      const draft = new URLSearchParams(location.search).has("preview") ? store.get("xh_preview") : null;
      this.preview = Boolean(draft);
      this.content = merge(D.content, draft || cache.content || {});
      this.services = Array.isArray(cache.services) ? cache.services : D.services;
      this.hours = cache.hours || D.hours;
      this.settings = merge(D.settings, cache.settings || {});
    },

    // Trae los datos reales desde Supabase
    async load({ services = false, hours = false, settings = false } = {}) {
      if (!db) return false;
      const none = Promise.resolve(null);
      const [s, sv, h, st] = await Promise.all([
        db.from("site").select("data").maybeSingle(),
        services ? db.from("services").select("id, name, duration_min, price, featured").eq("active", true).order("sort").order("id") : none,
        hours ? db.from("working_hours").select("weekday, opens, closes").order("opens") : none,
        settings ? db.from("settings").select("*").maybeSingle() : none,
      ]).catch(() => []);

      if (!s || s.error) return false;
      if (!this.preview) this.content = merge(D.content, s.data?.data || {});
      if (sv && !sv.error) this.services = sv.data;
      if (h && !h.error) this.hours = groupHours(h.data);
      if (st && !st.error && st.data) this.settings = merge(D.settings, st.data);

      this.saveCache();
      this.applyTheme(this.content.theme, !this.preview);
      return true;
    },

    saveCache() {
      if (this.preview) return;
      store.set("xh_cache", { content: this.content, services: this.services, hours: this.hours, settings: this.settings });
    },

    // Pone los colores, tipografías y bordes en las variables CSS de la página
    applyTheme(t = {}, persist = true) {
      const d = D.content.theme;
      const hex = (v, def) => (/^#[0-9a-f]{6}$/i.test(v || "") ? v : def);
      const font = (f, def) => (FONTS[f] ? f : def);

      const vars = {
        "--bg": hex(t.bg, d.bg),
        "--surface": hex(t.surface, d.surface),
        "--text": hex(t.text, d.text),
        "--muted": hex(t.muted, d.muted),
        "--accent": hex(t.accent, d.accent),
        "--accent-text": hex(t.accentText, d.accentText),
      };
      const head = font(t.fontHead, d.fontHead), body = font(t.fontBody, d.fontBody);
      vars["--font-head"] = `"${head}", system-ui, -apple-system, "Segoe UI", sans-serif`;
      vars["--font-body"] = `"${body}", system-ui, -apple-system, "Segoe UI", sans-serif`;

      const [r, rs, rb] = RADIUS[t.radius] || RADIUS[d.radius];
      vars["--radius"] = r;
      vars["--radius-sm"] = rs;
      vars["--radius-btn"] = rb;

      const shade = Math.min(0.95, Math.max(0, Number(t.heroShade ?? d.heroShade) || 0));
      vars["--hero-shade"] = `${Math.round(shade * 100)}%`;
      vars["--stripes"] = t.stripes === false ? "0" : "1";

      const dark = luminance(vars["--bg"]) < 0.35;
      vars["--scheme"] = dark ? "dark" : "light";
      vars["--map-filter"] = dark ? "grayscale(1) invert(.92) contrast(.9)" : "grayscale(.25)";

      const root = document.documentElement;
      for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);

      const families = [...new Set([head, body])].map((f) => `family=${FONTS[f]}`).join("&");
      const fonts = `https://fonts.googleapis.com/css2?${families}&display=swap`;
      const link = document.getElementById("theme-fonts");
      if (link && link.href !== fonts) link.href = fonts;

      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = vars["--bg"];

      if (persist) store.set("xh_theme", { vars, fonts });
    },

    // Rellena los elementos marcados en el HTML:
    //   data-text="hero.lead"   -> texto
    //   data-lines="hero.title" -> texto con saltos de línea
    //   data-logo               -> logo en dos partes
    bindTexts(root = document) {
      root.querySelectorAll("[data-text]").forEach((el) => {
        const v = this.get(el.dataset.text);
        if (typeof v === "string") el.textContent = v;
      });
      root.querySelectorAll("[data-lines]").forEach((el) => {
        const v = this.get(el.dataset.lines);
        if (typeof v !== "string") return;
        const nodes = [];
        v.split("\n").forEach((line, i) => {
          if (i) nodes.push(document.createElement("br"));
          nodes.push(document.createTextNode(line));
        });
        el.replaceChildren(...nodes);
      });
      root.querySelectorAll("[data-logo]").forEach((el) => {
        const b = this.content.brand || {};
        const second = document.createElement("span");
        second.textContent = el.dataset.logo === "panel" ? "PANEL" : b.logo2 || "";
        el.replaceChildren(document.createTextNode(b.logo1 || ""), second);
      });
    },

    // Link de WhatsApp al número del negocio
    wa(text) {
      const c = this.content.contact || {};
      return window.U.waLink(text ?? c.whatsappMessage, c.whatsapp);
    },
  };

  window.Site = Site;
  Site.init();
})();
