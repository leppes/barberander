(function () {
  const S = window.SITE;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

  function formatDuration(min) {
    const h = Math.floor(min / 60), m = min % 60;
    if (!h) return `${m} min`;
    return m ? `${h} h ${m} min` : `${h} h`;
  }

  // Enlaces globales
  const waUrl = `https://wa.me/${S.whatsapp}?text=${encodeURIComponent(S.whatsappMessage)}`;
  $$("[data-wa]").forEach((a) => (a.href = waUrl));
  $$("[data-book]").forEach((a) => {
    a.href = S.bookingUrl;
    if (/^https?:/.test(S.bookingUrl)) { a.target = "_blank"; a.rel = "noopener"; }
  });

  // Servicios
  $("#services").innerHTML = S.services.map((s) => `
    <article class="service">
      <div>
        <h3>${s.name}${s.featured ? '<span class="service__badge">Popular</span>' : ""}</h3>
        <p class="service__meta"><strong>${clp.format(s.price)}</strong> · ${formatDuration(s.duration)}</p>
      </div>
      <a class="btn btn--ghost btn--sm" href="${S.bookingUrl}" target="_blank" rel="noopener">Reservar</a>
    </article>`).join("");

  // Barbero
  $("#barberName").textContent = S.barber.name;
  $("#barberBio").textContent = S.barber.bio;
  $("#barberTags").innerHTML = S.barber.highlights.map((t) => `<li>${t}</li>`).join("");
  if (S.instagram) { const ig = $("#igLink"); ig.href = S.instagram; ig.hidden = false; }

  // Galería: si falta la foto, queda el recuadro de muestra
  $("#gallery").innerHTML = Array.from({ length: S.gallery }, (_, i) => `
    <figure class="gallery__item" style="margin:0">
      <span>Foto ${i + 1}</span>
      <img src="img/galeria-${i + 1}.jpg" alt="Corte ${i + 1} en ${S.name}" loading="lazy" onerror="this.remove()">
    </figure>`).join("");

  // Hora actual en Chile
  function nowInTz() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: S.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t).value;
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
    return { day, minutes: parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10) };
  }
  const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

  const now = nowInTz();

  // Tabla de horario (lunes primero)
  $("#hours").innerHTML = [1, 2, 3, 4, 5, 6, 0].map((d) => {
    const h = S.hours[d];
    return `<tr class="${d === now.day ? "is-today" : ""}"><td>${DAYS[d]}</td><td>${h ? `${h[0]} – ${h[1]}` : "Cerrado"}</td></tr>`;
  }).join("");

  // Estado abierto / cerrado
  function status() {
    const today = S.hours[now.day];
    if (today && now.minutes >= toMin(today[0]) && now.minutes < toMin(today[1])) {
      return { open: true, text: `Abierto ahora · cierra a las ${today[1]}` };
    }
    if (today && now.minutes < toMin(today[0])) {
      return { open: false, text: `Cerrado · abre hoy a las ${today[0]}` };
    }
    for (let i = 1; i <= 7; i++) {
      const d = (now.day + i) % 7, h = S.hours[d];
      if (h) return { open: false, text: `Cerrado · abre ${i === 1 ? "mañana" : "el " + DAYS[d].toLowerCase()} a las ${h[0]}` };
    }
    return { open: false, text: "Cerrado" };
  }
  const st = status();
  $("#statusText").textContent = st.text;
  $("#statusDot").classList.add(st.open ? "is-open" : "is-closed");

  // Ubicación
  const fullAddress = `${S.address}, ${S.commune}`;
  const q = encodeURIComponent(fullAddress);
  $("#address").textContent = S.address;
  $("#commune").textContent = S.commune;
  $("#mapFrame").src = `https://www.google.com/maps?q=${q}&z=16&output=embed`;
  $("#mapsLink").href = `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  $("#wazeLink").href = `https://waze.com/ul?q=${q}&navigate=yes`;
  $("#phoneLink").href = `tel:+${S.whatsapp}`;

  // Footer
  $("#footerAddress").textContent = fullAddress;
  $("#footerPhone").textContent = S.phoneDisplay;
  $("#footerPhone").href = `tel:+${S.whatsapp}`;
  $("#year").textContent = new Date().getFullYear();

  // Menú móvil
  const menuBtn = $("#menuBtn"), nav = $("#nav");
  menuBtn.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    menuBtn.setAttribute("aria-expanded", open);
  });
  nav.addEventListener("click", (e) => {
    if (e.target.tagName === "A") { nav.classList.remove("is-open"); menuBtn.setAttribute("aria-expanded", "false"); }
  });
})();
