// Página principal: todo se pinta desde Site (lo que Anderson edita en el panel)
(function () {
  const Site = window.Site, U = window.U, { $, $$, esc } = U;
  const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const SECTIONS = ["services", "barber", "gallery", "location", "cta"];

  const ICONS = {
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z"/></svg>',
  };

  // ¿Se puede reservar online? Si no, los botones llevan a WhatsApp
  const online = () => Boolean(window.db) && Site.settings.booking_enabled !== false;

  function render() {
    const c = Site.content;
    Site.applyTheme(c.theme, !Site.preview);
    Site.bindTexts();

    document.title = `${c.brand.name} | ${c.brand.tagline}`;
    $('meta[name="description"]').content = `${c.brand.name}, ${c.brand.tagline}. ${c.hero.lead}`;

    // Secciones que Anderson decidió mostrar u ocultar
    for (const key of SECTIONS) {
      const show = c.sections?.[key]?.show !== false;
      $$(`[data-section="${key}"], [data-nav="${key}"]`).forEach((el) => (el.hidden = !show));
    }

    renderButtons(c);
    renderHero(c);
    renderServices();
    renderBarber(c);
    renderGallery(c);
    renderHours();
    renderLocation(c.contact || {});
    renderFooter(c);
    renderSeo(c);
    $("#previewBar").hidden = !Site.preview;
  }

  function renderButtons(c) {
    const wa = Site.wa();
    $$("[data-book]").forEach((a) => {
      if (online()) {
        a.href = "reservar.html";
        a.removeAttribute("target");
      } else {
        a.href = wa;
        a.target = "_blank";
        a.rel = "noopener";
      }
    });
    $$("[data-wa]").forEach((a) => (a.href = wa));
    $("#heroWa").hidden = c.hero.showWhatsapp === false;
    $("#waFloat").hidden = c.contact?.showFloat === false;
  }

  function renderHero(c) {
    const img = U.safeUrl(c.hero.image);
    $("#heroBg").style.setProperty("--hero-image", img ? `url("${new URL(img, location.href).href}")` : "none");

    const facts = (Array.isArray(c.hero.facts) ? c.hero.facts : []).filter((f) => f && (f.big || f.small));
    $("#heroFacts").hidden = !facts.length;
    $("#heroFacts").innerHTML = facts.map((f) => `<li><strong>${esc(f.big)}</strong> ${esc(f.small)}</li>`).join("");
  }

  function renderServices() {
    const list = Array.isArray(Site.services) ? Site.services : [];
    $("#services").innerHTML = list.length
      ? list.map((s) => {
          const href = online() ? `reservar.html?servicio=${s.id}` : Site.wa(`Hola, quiero reservar ${s.name} 💈`);
          const target = online() ? "" : ' target="_blank" rel="noopener"';
          return `
          <article class="service">
            <div>
              <h3>${esc(s.name)}${s.featured ? '<span class="service__badge">Popular</span>' : ""}</h3>
              <p class="service__meta"><strong>${U.clp.format(s.price)}</strong> · ${U.duration(s.duration_min)}</p>
            </div>
            <a class="btn btn--ghost btn--sm" href="${esc(href)}"${target}>Reservar</a>
          </article>`;
        }).join("")
      : '<p class="muted">Pronto publicaremos nuestros servicios.</p>';
  }

  function renderBarber(c) {
    const b = c.barber || {};
    $("#barberInitials").textContent = String(b.name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

    // La foto tapa las iniciales; si falla al cargar, quedan las iniciales
    const img = $("#barberPhoto"), photo = U.safeUrl(b.photo);
    img.alt = `Foto de ${b.name || ""}`;
    if (!photo) {
      img.hidden = true;
      img.removeAttribute("src");
    } else if (img.getAttribute("src") !== photo) {
      img.hidden = true;
      img.onload = () => (img.hidden = false);
      img.onerror = () => (img.hidden = true);
      img.src = photo;
    }

    const tags = Array.isArray(b.highlights) ? b.highlights.filter(Boolean) : [];
    $("#barberTags").hidden = !tags.length;
    $("#barberTags").innerHTML = tags.map((t) => `<li>${esc(t)}</li>`).join("");

    const ig = U.safeUrl(c.contact?.instagram);
    $("#igLink").hidden = !ig;
    if (ig) $("#igLink").href = ig;
  }

  function renderGallery(c) {
    const pics = (Array.isArray(c.gallery) ? c.gallery : []).map(U.safeUrl).filter(Boolean);
    if (!pics.length) $$('[data-section="gallery"], [data-nav="gallery"]').forEach((el) => (el.hidden = true));

    const g = $("#gallery");
    const n = pics.length;
    g.style.setProperty("--gallery-cols", n <= 2 ? 2 : n === 4 || (n % 4 === 0 && n % 3 !== 0) ? 4 : 3);

    const key = pics.join("|");
    if (g.dataset.key === key) return; // no recargar fotos si no cambiaron
    g.dataset.key = key;
    g.innerHTML = pics.map((src, i) => `
      <figure class="gallery__item"><img src="${esc(src)}" alt="Trabajo ${i + 1} de ${esc(c.brand.name)}" loading="lazy"></figure>`).join("");
    g.querySelectorAll("img").forEach((img) => img.addEventListener("error", () => img.closest("figure").remove()));
  }

  // ---------- Horario ----------
  function ranges(day) {
    return (Site.hours?.[day] || []).map(([o, c]) => ({ o, c, from: U.toMin(o), to: U.toMin(c) }));
  }

  function status() {
    const now = U.nowInTz();
    const today = ranges(now.day);
    const current = today.find((r) => now.minutes >= r.from && now.minutes < r.to);
    if (current) return { open: true, text: `Abierto ahora · cierra a las ${current.c}` };
    const later = today.find((r) => now.minutes < r.from);
    if (later) return { open: false, text: `Cerrado · abre hoy a las ${later.o}` };
    for (let i = 1; i <= 7; i++) {
      const d = (now.day + i) % 7, first = ranges(d)[0];
      if (first) return { open: false, text: `Cerrado · abre ${i === 1 ? "mañana" : `el ${DAYS[d].toLowerCase()}`} a las ${first.o}` };
    }
    return { open: null, text: "Horario por confirmar" };
  }

  function renderStatus() {
    const st = status();
    $("#statusText").textContent = st.text;
    $("#statusDot").classList.toggle("is-open", st.open === true);
    $("#statusDot").classList.toggle("is-closed", st.open === false);
  }

  function renderHours() {
    const today = U.nowInTz().day;
    $("#hours").innerHTML = [1, 2, 3, 4, 5, 6, 0].map((d) => {
      const r = ranges(d);
      const label = r.length ? r.map((x) => `${x.o} – ${x.c}`).join(" · ") : "Cerrado";
      return `<tr class="${d === today ? "is-today" : ""}"><td>${DAYS[d]}</td><td>${esc(label)}</td></tr>`;
    }).join("");
    renderStatus();
  }

  function renderLocation(contact) {
    const full = [contact.address, contact.commune].filter(Boolean).join(", ");
    const q = encodeURIComponent(full);
    $("#address").textContent = contact.address || "";
    $("#commune").textContent = contact.commune || "";

    const src = `https://www.google.com/maps?q=${q}&z=16&output=embed`;
    if ($("#mapFrame").getAttribute("src") !== src) $("#mapFrame").src = src;
    $("#mapsLink").href = `https://www.google.com/maps/dir/?api=1&destination=${q}`;
    $("#wazeLink").href = `https://waze.com/ul?q=${q}&navigate=yes`;

    const digits = String(contact.whatsapp || "").replace(/\D/g, "");
    $("#phoneLink").hidden = !digits;
    $("#phoneLink").href = `tel:+${digits}`;
  }

  function renderFooter(c) {
    const contact = c.contact || {};
    const digits = String(contact.whatsapp || "").replace(/\D/g, "");
    $("#footerAddress").textContent = [contact.address, contact.commune].filter(Boolean).join(", ");
    $("#footerPhone").textContent = contact.phoneDisplay || "";
    $("#footerPhone").href = `tel:+${digits}`;
    $("#year").textContent = new Date().getFullYear();

    const social = [["instagram", "Instagram"], ["tiktok", "TikTok"]]
      .map(([key, label]) => [key, label, U.safeUrl(contact[key])])
      .filter(([, , url]) => url);
    $("#footerSocial").hidden = !social.length;
    $("#footerSocial").innerHTML = social.map(([key, label, url]) =>
      `<a class="social" href="${esc(url)}" target="_blank" rel="noopener" aria-label="${label}">${ICONS[key]}</a>`).join("");
  }

  // Datos para Google (aparecer en búsquedas y en Maps)
  function renderSeo(c) {
    const contact = c.contact || {};
    const prices = (Site.services || []).map((s) => s.price);
    const hours = [];
    for (let d = 0; d < 7; d++) {
      for (const r of ranges(d)) hours.push({ "@type": "OpeningHoursSpecification", dayOfWeek: DAYS_EN[d], opens: r.o, closes: r.c });
    }
    const ld = {
      "@context": "https://schema.org",
      "@type": "BarberShop",
      name: c.brand.name,
      telephone: `+${String(contact.whatsapp || "").replace(/\D/g, "")}`,
      address: { "@type": "PostalAddress", streetAddress: contact.address, addressLocality: contact.commune, addressCountry: "CL" },
      openingHoursSpecification: hours,
    };
    if (prices.length) ld.priceRange = `${U.clp.format(Math.min(...prices))} - ${U.clp.format(Math.max(...prices))}`;
    $("#ldjson").textContent = JSON.stringify(ld);
  }

  // Menú del celular
  const menuBtn = $("#menuBtn"), nav = $("#nav");
  menuBtn.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    menuBtn.setAttribute("aria-expanded", open);
  });
  nav.addEventListener("click", (e) => {
    if (e.target.tagName === "A") {
      nav.classList.remove("is-open");
      menuBtn.setAttribute("aria-expanded", "false");
    }
  });

  // 1) Pintar al instante con lo guardado  2) traer lo último de la base de datos
  render();
  Site.load({ services: true, hours: true, settings: true })
    .then((ok) => ok && render())
    .finally(() => document.documentElement.classList.remove("xh-wait"));
  setInterval(renderStatus, 60000);
})();
