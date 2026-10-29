(async function () {
  const Site = window.Site, db = window.db, U = window.U, { $, esc } = U;

  // Lo que el cliente va eligiendo
  const state = { service: null, date: null, slot: null };

  function fatal(msg) {
    $("#flow").hidden = true;
    $("#fatal").hidden = false;
    $("#fatal").innerHTML = `${esc(msg)}<br><a class="btn btn--light btn--sm" href="${esc(Site.wa())}" target="_blank" rel="noopener">Reservar por WhatsApp</a>`;
  }

  function show(id) {
    const el = $(id);
    el.hidden = false;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Textos y colores guardados (al instante) y luego los últimos de la base de datos
  Site.bindTexts();
  if (!db) return fatal("Las reservas online todavía no están activas.");
  await Site.load({ settings: true });
  Site.bindTexts();
  document.title = `Reservar hora | ${Site.content.brand.name}`;
  if (Site.settings.booking_enabled === false) return fatal("Las reservas online están pausadas por ahora.");

  // ¿Pedimos el correo obligatorio? (se cambia en el panel, pestaña Avisos)
  const needEmail = Site.settings.require_email !== false;
  $("#emailHint").textContent = needEmail ? "(te llega la confirmación y el recordatorio)" : "(opcional)";
  $("#form").elements.email.required = needEmail;

  // ---------- Paso 1: servicios ----------
  const { data: services, error } = await db
    .from("services")
    .select("id, name, duration_min, price, featured")
    .eq("active", true)
    .order("sort")
    .order("id");
  if (error) return fatal("No pudimos cargar los servicios. Intenta de nuevo en un rato.");
  if (!services.length) return fatal("Todavía no hay servicios publicados.");

  $("#services").innerHTML = services.map((s) => `
    <button type="button" class="choice" data-id="${s.id}">
      <span class="choice__name">${esc(s.name)}${s.featured ? '<span class="service__badge">Popular</span>' : ""}</span>
      <span class="choice__meta"><strong>${U.clp.format(s.price)}</strong> · ${U.duration(s.duration_min)}</span>
    </button>`).join("");

  $("#services").addEventListener("click", (e) => {
    const btn = e.target.closest(".choice");
    if (!btn) return;
    selectService(services.find((s) => s.id === Number(btn.dataset.id)));
  });

  // Si viene desde la página principal con ?servicio=2 (o el nombre)
  const pre = new URLSearchParams(location.search).get("servicio");
  const preService = pre && services.find((s) => String(s.id) === pre || s.name === pre);
  if (preService) selectService(preService);

  function mark(container, selector, el) {
    container.querySelectorAll(selector).forEach((b) => b.classList.toggle("is-selected", b === el));
  }

  // ---------- Paso 2: días ----------
  async function selectService(service) {
    state.service = service;
    state.date = state.slot = null;
    mark($("#services"), ".choice", $(`.choice[data-id="${service.id}"]`));
    $("#step3").hidden = $("#step4").hidden = true;

    $("#days").innerHTML = '<p class="muted">Buscando días disponibles…</p>';
    show("#step2");

    const { data: dates, error } = await db.rpc("available_dates", { p_service_id: service.id });
    if (error) return ($("#days").innerHTML = '<p class="muted">No pudimos cargar los días. Intenta de nuevo.</p>');
    if (!dates.length) return ($("#days").innerHTML = '<p class="muted">No quedan horas disponibles en los próximos días. Escríbenos por WhatsApp.</p>');

    $("#days").innerHTML = dates.map((iso) => {
      const d = U.dateFromISO(iso);
      return `<button type="button" class="day" data-date="${iso}">
        <small>${U.weekday(d)}</small><strong>${U.dayNum(d)}</strong><small>${U.month(d)}</small>
      </button>`;
    }).join("");
  }

  $("#days").addEventListener("click", (e) => {
    const btn = e.target.closest(".day");
    if (btn) selectDate(btn.dataset.date, btn);
  });

  // ---------- Paso 3: horas ----------
  async function selectDate(iso, btn) {
    state.date = iso;
    state.slot = null;
    mark($("#days"), ".day", btn);
    $("#step4").hidden = true;

    $("#dayLabel").textContent = U.capitalize(U.longDate(U.dateFromISO(iso)));
    $("#slots").innerHTML = '<p class="muted">Cargando horas…</p>';
    show("#step3");

    const { data: slots, error } = await db.rpc("available_slots", { p_service_id: state.service.id, p_date: iso });
    if (error) return ($("#slots").innerHTML = '<p class="muted">No pudimos cargar las horas. Intenta de nuevo.</p>');

    const unique = [...new Set(slots.map((s) => s.starts_at))];
    $("#slots").innerHTML = unique.length
      ? unique.map((t) => `<button type="button" class="slot" data-time="${t}">${U.time(t)}</button>`).join("")
      : '<p class="muted">Ya no quedan horas este día. Elige otro.</p>';
  }

  $("#slots").addEventListener("click", (e) => {
    const btn = e.target.closest(".slot");
    if (!btn) return;
    state.slot = btn.dataset.time;
    mark($("#slots"), ".slot", btn);
    $("#summary").innerHTML = summaryHTML(state.service, state.slot);
    show("#step4");
  });

  function summaryHTML(service, start) {
    return `
      <div><span>Servicio</span><strong>${esc(service.name)}</strong></div>
      <div><span>Día</span><strong>${U.longDate(start)}</strong></div>
      <div><span>Hora</span><strong>${U.time(start)}</strong></div>
      <div><span>Precio</span><strong>${U.clp.format(service.price)}</strong></div>`;
  }

  // ---------- Paso 4: confirmar ----------
  $("#form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target.elements; // ojo: form.name sería el nombre del formulario, no el input
    const name = f.name.value.trim();
    const phone = f.phone.value.replace(/\D/g, "");
    const email = f.email.value.trim();

    const err = (msg) => { $("#formError").textContent = msg; $("#formError").hidden = false; };
    $("#formError").hidden = true;
    if (name.length < 2) return err("Escribe tu nombre.");
    if (!/^9\d{8}$/.test(phone)) return err("El teléfono debe tener 9 dígitos y empezar con 9. Ej: 9 1234 5678");
    if (needEmail && !email) return err("Escribe tu correo para enviarte la confirmación y el recordatorio.");
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err("Revisa tu correo.");

    const btn = $("#submitBtn");
    btn.disabled = true;
    btn.textContent = "Reservando…";

    const { data, error } = await db.rpc("create_booking", {
      p_service_id: state.service.id,
      p_starts_at: state.slot,
      p_name: name,
      p_phone: `+56${phone}`,
      p_email: email || null,
    });

    btn.disabled = false;
    btn.textContent = "Confirmar reserva";

    if (error) {
      err(error.message || "No pudimos reservar. Intenta de nuevo.");
      // Si alguien tomó la hora justo antes, recargamos las horas
      if (/disponible/i.test(error.message || "")) selectDate(state.date, $(`.day[data-date="${state.date}"]`));
      return;
    }
    // Que los correos salgan al instante (si falla, la tarea de cada 5 minutos los manda igual)
    db.functions.invoke("avisos", { body: {} }).catch(() => {});
    showDone(data[0], name, email);
  });

  // ---------- Confirmación ----------
  function showDone(b, name, email) {
    const c = Site.content.contact || {};
    const barber = String(b.barber_name || "").split(" ")[0];
    const manageUrl = new URL(`reserva.html?t=${b.cancel_token}`, location.href).href;
    const title = `${b.service_name} · ${Site.content.brand.name}`;
    const location_ = [c.address, c.commune].filter(Boolean).join(", ");

    $("#flow").hidden = true;
    $("#doneSummary").innerHTML = summaryHTML({ name: b.service_name, price: b.price }, b.starts_at);
    $("#doneEmail").hidden = !email;
    $("#doneEmail").textContent = email ? `Te enviamos la confirmación a ${email}. Revisa también la carpeta de spam.` : "";

    // iPhone: archivo de calendario con alarma. Android: Google Calendar.
    if (U.isApple()) {
      $("#calLink").href = U.icsUrl({
        title, start: b.starts_at, minutes: state.service.duration_min, location: location_,
        alarmHours: Site.settings.reminder_hours || 2, link: manageUrl,
      });
      $("#calLink").download = "cita.ics";
      $("#calLink").removeAttribute("target");
    } else {
      $("#calLink").href = U.calendarLink(title, b.starts_at, state.service.duration_min, location_);
    }
    $("#waLink").textContent = `Avisar a ${barber} por WhatsApp`;
    $("#waLink").href = Site.wa(
      `Hola ${barber} 👋 soy ${name}. Reservé ${b.service_name} el ${U.longDate(b.starts_at)} a las ${U.time(b.starts_at)}.`
    );
    $("#manageUrl").value = manageUrl;
    show("#done");
  }

  $("#copyBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("#manageUrl").value);
      $("#copyBtn").textContent = "¡Copiado!";
    } catch {
      $("#manageUrl").select();
    }
  });
})();
