// Panel de Anderson · parte 3: editor de la página (textos, fotos, secciones) y del diseño (colores, letras)
//
// Cómo funciona: los formularios se arman solos a partir de las listas PAGE y DESIGN.
// Cada campo tiene una "ruta" (ej. "hero.title") que dice dónde se guarda dentro del contenido.
// Los cambios van a una copia (draft) y solo se publican al tocar "Publicar".
(function () {
  const Site = window.Site, db = window.db, U = window.U, Admin = window.Admin, { $, $$, esc } = U;
  if (!db || !Admin) return;

  const BUCKET = "site";
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const getPath = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const setPath = (obj, path, value) => {
    const keys = path.split("."), last = keys.pop();
    let o = obj;
    for (const k of keys) {
      if (o[k] == null || typeof o[k] !== "object") o[k] = {};
      o = o[k];
    }
    o[last] = value;
  };

  let draft = null;       // copia de trabajo del contenido
  let dirty = false;      // ¿hay cambios sin publicar?
  let uploaded = [];      // fotos subidas en esta edición (se borran si descartas)
  let replaced = [];      // fotos que dejaron de usarse (se borran al publicar)

  // ---------------------------------------------------------------------
  // Estilos listos (colores)
  // ---------------------------------------------------------------------
  const PRESETS = {
    noche: { label: "Noche", bg: "#0e0e0e", surface: "#1b1b1b", text: "#f2f2f2", muted: "#9b9b9b", accent: "#ffffff", accentText: "#0e0e0e" },
    dorado: { label: "Negro y dorado", bg: "#0b0b0b", surface: "#18160f", text: "#f5efe2", muted: "#a89f8a", accent: "#c9a24a", accentText: "#111111" },
    clasico: { label: "Barbería clásica", bg: "#111111", surface: "#1d1a1a", text: "#f4f1ee", muted: "#a39a96", accent: "#c8372d", accentText: "#ffffff" },
    marino: { label: "Azul marino", bg: "#0b1220", surface: "#131d30", text: "#eef2f8", muted: "#93a0b8", accent: "#e9eef7", accentText: "#0b1220" },
    bosque: { label: "Verde bosque", bg: "#0d1410", surface: "#16211a", text: "#eef3ee", muted: "#94a597", accent: "#d9c27a", accentText: "#0d1410" },
    claro: { label: "Claro", bg: "#f6f4f0", surface: "#ffffff", text: "#151515", muted: "#6b6b6b", accent: "#151515", accentText: "#ffffff" },
  };
  const COLOR_KEYS = ["bg", "surface", "text", "muted", "accent", "accentText"];
  const FONT_OPTIONS = Object.keys(Site.FONTS).map((f) => [f, f]);

  // ---------------------------------------------------------------------
  // Qué se puede editar (cada grupo es una tarjeta del formulario)
  // ---------------------------------------------------------------------
  const PAGE = [
    { title: "Marca", fields: [
      { path: "brand.name", label: "Nombre del negocio", type: "text", max: 40 },
      { type: "row", fields: [
        { path: "brand.logo1", label: "Logo: parte fuerte", type: "text", max: 16 },
        { path: "brand.logo2", label: "Logo: parte suave", type: "text", max: 16 },
      ] },
      { path: "brand.tagline", label: "Frase corta (sale en Google y en la pestaña)", type: "text", max: 60 },
    ] },
    { title: "Portada", fields: [
      { path: "hero.image", label: "Foto de fondo", type: "image", size: 1920, wide: true },
      { path: "hero.title", label: "Título (Enter = salto de línea)", type: "textarea", rows: 2, max: 80 },
      { path: "hero.lead", label: "Texto bajo el título", type: "textarea", rows: 2, max: 180 },
      { path: "hero.cta", label: "Texto del botón", type: "text", max: 30 },
      { path: "hero.showWhatsapp", label: "Mostrar botón de WhatsApp", type: "toggle" },
      { path: "hero.facts", label: "Datos destacados (máximo 4)", type: "facts" },
    ] },
    { title: "Sección de servicios", hint: "Los servicios y precios se cambian en la pestaña Servicios.", fields: [
      { path: "sections.services.show", label: "Mostrar esta sección", type: "toggle" },
      { path: "sections.services.eyebrow", label: "Texto pequeño de arriba", type: "text", max: 30 },
      { path: "sections.services.title", label: "Título", type: "text", max: 60 },
    ] },
    { title: "Barbero", fields: [
      { path: "sections.barber.show", label: "Mostrar esta sección", type: "toggle" },
      { path: "barber.photo", label: "Foto", type: "image", size: 1200 },
      { path: "barber.name", label: "Nombre", type: "text", max: 40 },
      { path: "sections.barber.eyebrow", label: "Texto pequeño de arriba", type: "text", max: 30 },
      { path: "barber.bio", label: "Descripción", type: "textarea", rows: 4, max: 400 },
      { path: "barber.highlights", label: "Especialidades", type: "tags", max: 8 },
      { path: "sections.barber.cta", label: "Texto del botón", type: "text", max: 40 },
    ] },
    { title: "Galería", fields: [
      { path: "sections.gallery.show", label: "Mostrar esta sección", type: "toggle" },
      { path: "sections.gallery.eyebrow", label: "Texto pequeño de arriba", type: "text", max: 30 },
      { path: "sections.gallery.title", label: "Título", type: "text", max: 60 },
      { path: "gallery", label: "Fotos (con las flechas cambias el orden)", type: "gallery", size: 1200, max: 12 },
    ] },
    { title: "Horario y ubicación", hint: "Las horas de atención se cambian en la pestaña Horario.", fields: [
      { path: "sections.location.show", label: "Mostrar esta sección", type: "toggle" },
      { path: "sections.location.eyebrow", label: "Texto pequeño de arriba", type: "text", max: 30 },
      { path: "sections.location.title", label: "Título", type: "text", max: 60 },
      { path: "contact.address", label: "Dirección", type: "text", max: 80 },
      { path: "contact.commune", label: "Comuna y ciudad", type: "text", max: 60 },
    ] },
    { title: "Llamado final", fields: [
      { path: "sections.cta.show", label: "Mostrar esta sección", type: "toggle" },
      { path: "sections.cta.title", label: "Título", type: "text", max: 60 },
      { path: "sections.cta.text", label: "Texto", type: "text", max: 120 },
      { path: "sections.cta.button", label: "Texto del botón", type: "text", max: 30 },
    ] },
    { title: "Página de reservas", fields: [
      { path: "booking.title", label: "Título", type: "text", max: 40 },
      { path: "booking.lead", label: "Texto bajo el título", type: "text", max: 120 },
      { path: "booking.doneTitle", label: "Mensaje al confirmar la reserva", type: "text", max: 40 },
    ] },
    { title: "Contacto y redes", fields: [
      { path: "contact.whatsapp", label: "WhatsApp (con 56 adelante, sin + ni espacios)", type: "text", max: 15, inputmode: "numeric", placeholder: "56912345678" },
      { path: "contact.phoneDisplay", label: "Teléfono como se muestra en la página", type: "text", max: 30 },
      { path: "contact.whatsappMessage", label: "Mensaje que aparece escrito al abrir WhatsApp", type: "textarea", rows: 2, max: 200 },
      { path: "contact.showFloat", label: "Botón flotante de WhatsApp", type: "toggle" },
      { path: "contact.instagram", label: "Instagram (link o @usuario)", type: "text", max: 120, placeholder: "@xanderhome" },
      { path: "contact.tiktok", label: "TikTok (link o @usuario)", type: "text", max: 120, placeholder: "@xanderhome" },
    ] },
  ];

  const DESIGN = [
    { title: "Estilos listos", hint: "Toca uno para probarlo: todo el panel cambia para que veas cómo queda.", fields: [{ type: "presets" }] },
    { title: "Colores", hint: "O elige cada color a tu gusto.", fields: [
      { type: "grid", fields: [
        { path: "theme.bg", label: "Fondo", type: "color" },
        { path: "theme.surface", label: "Tarjetas", type: "color" },
        { path: "theme.text", label: "Texto", type: "color" },
        { path: "theme.muted", label: "Texto secundario", type: "color" },
        { path: "theme.accent", label: "Botón principal", type: "color" },
        { path: "theme.accentText", label: "Texto del botón", type: "color" },
      ] },
      { type: "contrast" },
    ] },
    { title: "Tipografía", fields: [
      { type: "row", fields: [
        { path: "theme.fontHead", label: "Títulos", type: "select", options: FONT_OPTIONS },
        { path: "theme.fontBody", label: "Textos", type: "select", options: FONT_OPTIONS },
      ] },
      { type: "fontPreview" },
    ] },
    { title: "Formas y efectos", fields: [
      { path: "theme.radius", label: "Bordes", type: "select", options: [["round", "Redondeados"], ["soft", "Suaves"], ["square", "Rectos"]] },
      { path: "theme.heroShade", label: "Oscurecer la foto de portada", type: "range", min: 0, max: 0.95, step: 0.05 },
      { path: "theme.stripes", label: "Líneas diagonales en la portada", type: "toggle" },
    ] },
  ];

  // ---------------------------------------------------------------------
  // Cómo se dibuja cada tipo de campo
  // ---------------------------------------------------------------------
  const attr = (name, v) => (v === undefined || v === null || v === "" ? "" : ` ${name}="${esc(v)}"`);

  const R = {
    text: (f, v) => `<label class="field"><span>${f.label}</span>
      <input type="text" data-path="${f.path}" value="${esc(v ?? "")}"${attr("maxlength", f.max)}${attr("placeholder", f.placeholder)}${attr("inputmode", f.inputmode)}></label>`,

    textarea: (f, v) => `<label class="field"><span>${f.label}</span>
      <textarea data-path="${f.path}" rows="${f.rows || 3}"${attr("maxlength", f.max)}>${esc(v ?? "")}</textarea></label>`,

    toggle: (f, v) => `<label class="switch"><input type="checkbox" data-path="${f.path}" ${v !== false ? "checked" : ""}>
      <span class="switch__track"></span><span>${f.label}</span></label>`,

    select: (f, v) => `<label class="field"><span>${f.label}</span><select data-path="${f.path}">
      ${f.options.map(([val, txt]) => `<option value="${esc(val)}" ${String(val) === String(v) ? "selected" : ""}>${esc(txt)}</option>`).join("")}
      </select></label>`,

    color: (f, v) => `<label class="color-field"><input type="color" data-path="${f.path}" value="${esc(v)}">
      <span>${f.label}<code>${esc(v)}</code></span></label>`,

    range: (f, v) => `<label class="field"><span>${f.label} <b data-out="${f.path}">${Math.round(v * 100)}%</b></span>
      <input type="range" data-path="${f.path}" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}"></label>`,

    row: (f) => `<div class="row">${f.fields.map(field).join("")}</div>`,
    grid: (f) => `<div class="grid-2">${f.fields.map(field).join("")}</div>`,

    image: (f, v) => {
      const url = U.safeUrl(v);
      return `<div class="field" data-field="${f.path}"><span>${f.label}</span>
        <div class="img-field">
          <div class="img-field__thumb${f.wide ? " img-field__thumb--wide" : ""}"${url ? ` style="background-image:url('${esc(url)}')"` : ""}>${url ? "" : "Sin foto"}</div>
          <div class="img-field__actions">
            <label class="btn btn--ghost btn--sm">${url ? "Cambiar foto" : "Subir foto"}
              <input type="file" accept="image/*" data-upload="${f.path}" data-size="${f.size}" hidden></label>
            ${url ? `<button type="button" class="btn btn--ghost btn--sm btn--danger" data-clear="${f.path}">Quitar</button>` : ""}
          </div>
        </div></div>`;
    },

    gallery: (f, v) => {
      const pics = Array.isArray(v) ? v : [];
      return `<div class="field" data-field="${f.path}"><span>${f.label}</span>
        <div class="gallery-edit">
          ${pics.map((src, i) => `
            <div class="gallery-edit__item" style="background-image:url('${esc(U.safeUrl(src))}')">
              <div class="gallery-edit__tools">
                <button type="button" class="icon-btn icon-btn--sm" data-gal="left" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Mover antes">←</button>
                <button type="button" class="icon-btn icon-btn--sm" data-gal="right" data-i="${i}" ${i === pics.length - 1 ? "disabled" : ""} aria-label="Mover después">→</button>
                <button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-gal="remove" data-i="${i}" aria-label="Quitar foto">✕</button>
              </div>
            </div>`).join("")}
          ${pics.length < f.max ? `<label class="gallery-edit__add">+ Agregar fotos
            <input type="file" accept="image/*" multiple data-upload="${f.path}" data-size="${f.size}" data-multiple hidden></label>` : ""}
        </div></div>`;
    },

    tags: (f, v) => {
      const tags = Array.isArray(v) ? v : [];
      return `<div class="field" data-field="${f.path}"><span>${f.label}</span>
        <div class="chips">${tags.map((t, i) => `<span class="chip">${esc(t)}<button type="button" data-tag-remove="${i}" aria-label="Quitar ${esc(t)}">✕</button></span>`).join("")}</div>
        ${tags.length < f.max ? `<input type="text" class="chip-input" data-tag-add maxlength="24" placeholder="Escribe una y presiona Enter">` : ""}
        </div>`;
    },

    facts: (f, v) => {
      const facts = Array.isArray(v) ? v : [];
      return `<div class="field" data-field="${f.path}"><span>${f.label}</span>
        ${facts.map((x, i) => `
          <div class="fact-row">
            <input type="text" data-fact="${i}" data-key="big" value="${esc(x.big || "")}" maxlength="16" placeholder="Ej: 5" aria-label="Dato grande">
            <input type="text" data-fact="${i}" data-key="small" value="${esc(x.small || "")}" maxlength="24" placeholder="Ej: servicios" aria-label="Texto chico">
            <button type="button" class="icon-btn icon-btn--danger" data-fact-remove="${i}" aria-label="Quitar dato">✕</button>
          </div>`).join("")}
        ${facts.length < 4 ? '<button type="button" class="link-btn" data-fact-add>+ Agregar dato</button>' : ""}
        </div>`;
    },

    presets: () => `<div class="presets">${Object.entries(PRESETS).map(([key, p]) => `
      <button type="button" class="preset${draft.theme.preset === key ? " is-selected" : ""}" data-preset="${key}"
        style="background:${p.bg};color:${p.text};border-color:${p.surface}">
        <span class="preset__dots"><i style="background:${p.surface}"></i><i style="background:${p.accent}"></i><i style="background:${p.muted}"></i></span>
        ${esc(p.label)}
      </button>`).join("")}</div>`,

    contrast: () => '<div id="contrastBox"></div>',

    fontPreview: () => `<div class="font-preview"><h3>Tu estilo, en buenas manos.</h3>
      <p>Cortes, barba y cejas. Reserva tu hora en segundos.</p></div>`,
  };

  function field(f) {
    return R[f.type](f, f.path ? getPath(draft, f.path) : undefined);
  }

  function renderForm(name) {
    const box = name === "page" ? $("#pageForm") : $("#designForm");
    const groups = name === "page" ? PAGE : DESIGN;
    box.innerHTML = groups.map((g) => `
      <div class="step">
        <h2 class="step__title">${g.title}</h2>
        ${g.hint ? `<p class="step__hint">${g.hint}</p>` : ""}
        <div class="form">${g.fields.map(field).join("")}</div>
      </div>`).join("");
    if (name === "design") updateContrast();
  }

  // Vuelve a dibujar la pestaña abierta (después de cambios que mueven cosas)
  function rerender() {
    if (!$('[data-panel="page"]').hidden) renderForm("page");
    if (!$('[data-panel="design"]').hidden) renderForm("design");
  }

  function ensureDraft() {
    if (!draft) draft = clone(Site.content);
  }

  Admin.tabs.page = () => { ensureDraft(); renderForm("page"); };
  Admin.tabs.design = () => { ensureDraft(); renderForm("design"); };

  // ---------------------------------------------------------------------
  // Cambios
  // ---------------------------------------------------------------------
  function touch() {
    dirty = true;
    $("#savebar").hidden = false;
  }

  function liveTheme() {
    Site.applyTheme(draft.theme, false);
    updateContrast();
  }

  function onInput(e) {
    const el = e.target;
    if (el.dataset.path) {
      const path = el.dataset.path;
      const value = el.type === "checkbox" ? el.checked : el.type === "range" ? Number(el.value) : el.value;
      setPath(draft, path, value);
      if (el.type === "color") {
        el.parentElement.querySelector("code").textContent = value;
        draft.theme.preset = "custom";
        $$(".preset").forEach((p) => p.classList.remove("is-selected"));
      }
      if (el.type === "range") $(`[data-out="${path}"]`).textContent = `${Math.round(value * 100)}%`;
      if (path.startsWith("theme.")) liveTheme();
      touch();
    } else if (el.dataset.fact !== undefined) {
      draft.hero.facts[Number(el.dataset.fact)][el.dataset.key] = el.value;
      touch();
    }
  }

  function addTag(input) {
    const value = input.value.trim();
    if (!value) return;
    const path = input.closest("[data-field]").dataset.field;
    const tags = getPath(draft, path) || [];
    if (!tags.includes(value)) setPath(draft, path, [...tags, value]);
    input.value = "";
    touch();
    rerender();
    const next = $(`[data-field="${path}"] [data-tag-add]`);
    if (next) next.focus();
  }

  function onClick(e) {
    const t = e.target.closest("button");
    if (!t) return;
    const fieldEl = t.closest("[data-field]");
    const path = fieldEl?.dataset.field;

    if (t.dataset.preset) {
      const p = PRESETS[t.dataset.preset];
      for (const k of COLOR_KEYS) draft.theme[k] = p[k];
      draft.theme.preset = t.dataset.preset;
      liveTheme();
      touch();
      return renderForm("design");
    }
    if (t.dataset.clear) {
      dropImage(getPath(draft, t.dataset.clear));
      setPath(draft, t.dataset.clear, "");
    } else if (t.dataset.gal) {
      const arr = getPath(draft, path), i = Number(t.dataset.i);
      if (t.dataset.gal === "left") [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      if (t.dataset.gal === "right") [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
      if (t.dataset.gal === "remove") dropImage(arr.splice(i, 1)[0]);
    } else if (t.dataset.tagRemove !== undefined) {
      getPath(draft, path).splice(Number(t.dataset.tagRemove), 1);
    } else if (t.hasAttribute("data-fact-add")) {
      draft.hero.facts = [...(draft.hero.facts || []), { big: "", small: "" }];
    } else if (t.dataset.factRemove !== undefined) {
      draft.hero.facts.splice(Number(t.dataset.factRemove), 1);
    } else {
      return;
    }
    touch();
    rerender();
  }

  for (const box of [$("#pageForm"), $("#designForm")]) {
    box.addEventListener("input", onInput);
    box.addEventListener("click", onClick);
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.matches("[data-tag-add]")) { e.preventDefault(); addTag(e.target); }
    });
    box.addEventListener("change", (e) => {
      if (e.target.matches("[data-tag-add]")) addTag(e.target);
      if (e.target.matches("input[type=file][data-upload]")) onUpload(e.target);
    });
  }

  // ---------------------------------------------------------------------
  // Contraste: avisa si algún texto se va a leer mal
  // ---------------------------------------------------------------------
  function updateContrast() {
    const box = $("#contrastBox");
    if (!box || !draft) return;
    const t = draft.theme;
    const checks = [
      ["El texto sobre el fondo", t.text, t.bg, 4.5],
      ["El texto sobre las tarjetas", t.text, t.surface, 4.5],
      ["El texto del botón", t.accentText, t.accent, 4.5],
      ["El texto secundario", t.muted, t.bg, 3],
    ].map(([label, a, b, min]) => ({ label, ratio: Site.contrast(a, b), min }));
    const bad = checks.filter((c) => c.ratio < c.min);
    box.innerHTML = bad.length
      ? bad.map((c) => `<p class="warn">⚠️ ${c.label} se lee poco (contraste ${c.ratio.toFixed(1)}, ideal ${c.min} o más). Prueba un color más claro u oscuro.</p>`).join("")
      : '<p class="ok-note">✓ Todos los textos se leen bien con estos colores.</p>';
  }

  // ---------------------------------------------------------------------
  // Fotos: se achican en el celular antes de subir (más rápido y no gasta espacio)
  // ---------------------------------------------------------------------
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const storagePath = (url) => (typeof url === "string" && url.includes(marker) ? decodeURIComponent(url.split(marker)[1]) : null);

  function dropImage(url) {
    const p = storagePath(url);
    if (p) replaced.push(p);
  }

  async function compress(file, max) {
    const src = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("No se pudo leer la foto. Prueba con otra."));
        i.src = src;
      });
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    } finally {
      URL.revokeObjectURL(src);
    }
  }

  async function uploadImage(file, size, folder) {
    if (!file.type.startsWith("image/")) throw new Error("Ese archivo no es una foto.");
    const blob = await compress(file, size);
    const name = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await db.storage.from(BUCKET).upload(name, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
    if (error) throw new Error(`No se pudo subir la foto (${error.message}).`);
    uploaded.push(name);
    return db.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
  }

  async function onUpload(input) {
    const path = input.dataset.upload, size = Number(input.dataset.size) || 1600;
    const files = [...input.files];
    if (!files.length) return;
    const actions = input.closest("[data-field]").querySelector(".img-field__actions, .gallery-edit");
    actions.insertAdjacentHTML("beforeend", `<span class="uploading">Subiendo ${files.length > 1 ? `${files.length} fotos` : "foto"}…</span>`);
    try {
      const urls = [];
      for (const file of files) urls.push(await uploadImage(file, size, path.split(".")[0]));
      if (input.hasAttribute("data-multiple")) {
        const max = PAGE.flatMap((g) => g.fields).find((f) => f.path === path)?.max || 12;
        setPath(draft, path, [...(getPath(draft, path) || []), ...urls].slice(0, max));
      } else {
        dropImage(getPath(draft, path));
        setPath(draft, path, urls[0]);
      }
      touch();
      Admin.toast(urls.length > 1 ? `${urls.length} fotos subidas ✓` : "Foto subida ✓");
    } catch (err) {
      Admin.toast(err.message || "No se pudo subir la foto.", "error");
    }
    rerender();
  }

  // ---------------------------------------------------------------------
  // Publicar, descartar y vista previa
  // ---------------------------------------------------------------------
  // "@usuario" o "instagram.com/usuario" -> link completo
  function socialUrl(value, base) {
    let v = String(value || "").trim();
    if (!v) return "";
    if (v.startsWith("@")) return `${base}${v.slice(1)}`;
    if (!/^https?:\/\//i.test(v)) v = `https://${v.replace(/^\/+/, "")}`;
    return v.replace(/^http:\/\//i, "https://");
  }

  // Deja los datos de contacto en el formato que entiende la página
  function normalize() {
    const c = draft.contact;
    c.whatsapp = String(c.whatsapp || "").replace(/\D/g, "");
    c.instagram = socialUrl(c.instagram, "https://instagram.com/");
    c.tiktok = socialUrl(c.tiktok, "https://www.tiktok.com/@");
  }

  function validate() {
    normalize();
    const c = draft.contact;
    if (!/^\d{10,15}$/.test(c.whatsapp)) return "El WhatsApp debe tener solo números, con el 56 adelante (ej: 56912345678).";
    if (!String(draft.brand.name || "").trim()) return "El nombre del negocio no puede quedar vacío.";
    if (!String(draft.barber.name || "").trim()) return "El nombre del barbero no puede quedar vacío.";
    for (const [key, label] of [["instagram", "Instagram"], ["tiktok", "TikTok"]]) {
      if (c[key] && !U.safeUrl(c[key])) return `Revisa el link de ${label}.`;
    }
    draft.hero.facts = (draft.hero.facts || []).filter((f) => String(f.big || "").trim() || String(f.small || "").trim());
    return null;
  }

  $("#sbSave").addEventListener("click", (e) => {
    const problem = validate();
    if (problem) return Admin.toast(problem, "error");
    Admin.busy(e.currentTarget, async () => {
      const { data, error } = await db.from("site")
        .update({ data: draft, updated_at: new Date().toISOString() })
        .eq("id", true).select("id");
      if (error || !data?.length) throw new Error("No se pudieron publicar los cambios.");

      // El nombre del barbero también se usa en las reservas
      await db.from("barbers").update({ name: draft.barber.name.trim() }).eq("id", Admin.barberId);
      if (replaced.length) await db.storage.from(BUCKET).remove(replaced);

      replaced = [];
      uploaded = [];
      dirty = false;
      Site.content = Site.merge(window.SITE_DEFAULTS.content, clone(draft));
      Site.applyTheme(Site.content.theme);
      Site.saveCache();
      Site.bindTexts();
      $("#savebar").hidden = true;
      rerender();
      Admin.toast("¡Cambios publicados! ✓");
    }, "Publicando…");
  });

  $("#sbDiscard").addEventListener("click", async () => {
    if (!confirm("¿Descartar los cambios que no has publicado?")) return;
    if (uploaded.length) await db.storage.from(BUCKET).remove(uploaded);
    uploaded = [];
    replaced = [];
    dirty = false;
    draft = clone(Site.content);
    Site.applyTheme(Site.content.theme);
    $("#savebar").hidden = true;
    rerender();
    Admin.toast("Cambios descartados");
  });

  $("#sbPreview").addEventListener("click", () => {
    normalize();
    Site.store.set("xh_preview", draft);
    window.open("index.html?preview=1", "_blank");
  });

  // Aviso si intenta cerrar la página con cambios sin publicar
  window.addEventListener("beforeunload", (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ""; }
  });
})();
