// Panel de Anderson · parte 2: horario, reglas de reserva, servicios y cuenta
(function () {
  const Site = window.Site, db = window.db, U = window.U, Admin = window.Admin, { $, esc } = U;
  if (!db || !Admin) return;

  const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const ORDER = [1, 2, 3, 4, 5, 6, 0];
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // =====================================================================
  // Horario
  // =====================================================================
  let hours = null; // copia de trabajo: { 0: [["10:00","21:00"]], ... }

  Admin.tabs.hours = () => {
    hours = clone(Site.hours || {});
    for (const d of ORDER) hours[d] = Array.isArray(hours[d]) ? hours[d] : [];
    renderHours();
    renderRules();
    fillPreviewSelects();
    updatePreview();
  };

  function renderHours() {
    $("#hoursEditor").innerHTML = ORDER.map((d) => {
      const ranges = hours[d], open = ranges.length > 0;
      return `
      <div class="day-row" data-day="${d}">
        <div class="day-row__head">
          <strong>${DAYS[d]}</strong>
          <label class="switch">
            <input type="checkbox" data-act="toggle" ${open ? "checked" : ""}>
            <span class="switch__track"></span><span>${open ? "Abierto" : "Cerrado"}</span>
          </label>
        </div>
        ${ranges.map(([o, c], i) => `
          <div class="range-row" data-i="${i}">
            <input type="time" step="300" value="${o}" data-act="opens" aria-label="${DAYS[d]}: abre">
            <span class="muted">a</span>
            <input type="time" step="300" value="${c}" data-act="closes" aria-label="${DAYS[d]}: cierra">
            ${ranges.length > 1 ? '<button class="icon-btn icon-btn--danger" type="button" data-act="remove" aria-label="Quitar tramo">✕</button>' : ""}
          </div>`).join("")}
        ${open && ranges.length < 3 ? '<button class="link-btn" type="button" data-act="add">+ Agregar tramo (ej. después de almuerzo)</button>' : ""}
      </div>`;
    }).join("");
  }

  $("#hoursEditor").addEventListener("input", (e) => {
    const el = e.target, row = el.closest(".range-row");
    if (!row || !el.value) return;
    const d = Number(el.closest(".day-row").dataset.day), i = Number(row.dataset.i);
    hours[d][i][el.dataset.act === "opens" ? 0 : 1] = el.value;
    updatePreview();
  });

  $("#hoursEditor").addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.dataset.act === "opens" || el.dataset.act === "closes") return;
    const d = Number(el.closest(".day-row").dataset.day);

    if (el.dataset.act === "toggle") {
      // Al abrir un día, copiamos el horario del primer día abierto (normalmente el lunes)
      const model = ORDER.map((x) => hours[x]).find((r) => r.length);
      hours[d] = el.checked ? clone(model || [["10:00", "21:00"]]) : [];
    }
    if (el.dataset.act === "add") {
      const last = hours[d][hours[d].length - 1];
      const from = Math.min(U.toMin(last[1]) + 60, 22 * 60);
      hours[d].push([U.fromMin(from), U.fromMin(Math.min(from + 180, 23 * 60 + 55))]);
    }
    if (el.dataset.act === "remove") hours[d].splice(Number(el.closest(".range-row").dataset.i), 1);
    renderHours();
    updatePreview();
  });

  $("#copyMonday").addEventListener("click", () => {
    if (!hours[1].length) return Admin.toast("Primero marca el lunes como abierto.", "error");
    for (const d of ORDER) if (d !== 1 && hours[d].length) hours[d] = clone(hours[1]);
    renderHours();
    updatePreview();
    Admin.toast("Copiado. Recuerda guardar.");
  });

  // Revisa que los tramos tengan sentido antes de guardar
  function hoursError() {
    for (const d of ORDER) {
      const ranges = [...hours[d]].sort((a, b) => U.toMin(a[0]) - U.toMin(b[0]));
      for (let i = 0; i < ranges.length; i++) {
        const [o, c] = ranges[i];
        if (U.toMin(c) <= U.toMin(o)) return `${DAYS[d]}: la hora de cierre (${c}) debe ser después de la de apertura (${o}).`;
        if (i && U.toMin(o) < U.toMin(ranges[i - 1][1])) return `${DAYS[d]}: los tramos se cruzan. Revisa las horas.`;
      }
      hours[d] = ranges;
    }
    return null;
  }

  $("#saveHours").addEventListener("click", (e) => {
    const problem = hoursError();
    if (problem) return Admin.toast(problem, "error");
    const rows = ORDER.flatMap((d) => hours[d].map(([opens, closes]) => ({ weekday: d, opens, closes })));
    Admin.busy(e.currentTarget, async () => {
      const { error } = await db.rpc("admin_set_hours", { p_hours: rows, p_barber_id: Admin.barberId });
      if (error) throw new Error("No se pudo guardar el horario.");
      Site.hours = clone(hours);
      Site.saveCache();
      renderHours();
      Admin.toast("Horario guardado ✓");
    });
  });

  // ---------- Vista previa de horas ----------
  function fillPreviewSelects() {
    const services = Site.services || [];
    $("#pvService").innerHTML = services.map((s) => `<option value="${s.id}">${esc(s.name)} (${U.duration(s.duration_min)})</option>`).join("");
    const firstOpen = ORDER.find((d) => hours[d].length) ?? 1;
    $("#pvDay").innerHTML = ORDER.map((d) => `<option value="${d}" ${d === firstOpen ? "selected" : ""}>${DAYS[d]}</option>`).join("");
  }
  $("#pvService").addEventListener("change", updatePreview);
  $("#pvDay").addEventListener("change", updatePreview);

  // Misma regla que usa la base de datos: desde que abre, cada X minutos, mientras el servicio alcance a terminar
  function previewSlots(ranges, duration, step) {
    const out = [];
    for (const [o, c] of ranges) {
      for (let t = U.toMin(o); t + duration <= U.toMin(c); t += step) out.push(U.fromMin(t));
    }
    return [...new Set(out)].sort();
  }

  function updatePreview() {
    const svc = (Site.services || []).find((s) => String(s.id) === $("#pvService").value);
    if (!svc) return ($("#pvSlots").innerHTML = '<p class="muted">Agrega un servicio para ver el ejemplo.</p>');
    const d = Number($("#pvDay").value);
    const step = Number($("#rulesForm").elements.slot_step_min?.value) || Site.settings.slot_step_min;
    const slots = previewSlots(hours[d] || [], svc.duration_min, step);

    $("#pvSlots").innerHTML = slots.length
      ? slots.map((t) => `<span class="slot slot--static">${t}</span>`).join("")
      : '<p class="muted">Ese día no se ofrecen horas (está cerrado o el tramo es muy corto).</p>';
    $("#pvNote").textContent = slots.length
      ? `${slots.length} horas. La última (${slots[slots.length - 1]}) termina a las ${U.fromMin(U.toMin(slots[slots.length - 1]) + svc.duration_min)}. Si quieres ofrecer horas más tarde, atrasa la hora de cierre.`
      : "";
  }

  // =====================================================================
  // Reglas de reserva
  // =====================================================================
  const RULES = [
    { name: "slot_step_min", label: "Cada cuánto se ofrecen horas", options: [[15, "Cada 15 minutos"], [20, "Cada 20 minutos"], [30, "Cada 30 minutos"], [45, "Cada 45 minutos"], [60, "Cada 1 hora"], [90, "Cada 1 hora y media"], [120, "Cada 2 horas"]] },
    { name: "buffer_min", label: "Descanso entre un cliente y otro", options: [[0, "Sin descanso"], [5, "5 minutos"], [10, "10 minutos"], [15, "15 minutos"], [20, "20 minutos"], [30, "30 minutos"]] },
    { name: "max_days_ahead", label: "Hasta cuándo se puede reservar", options: [[7, "1 semana hacia adelante"], [14, "2 semanas"], [21, "3 semanas"], [30, "1 mes"], [60, "2 meses"], [90, "3 meses"]] },
    { name: "min_notice_min", label: "Anticipación mínima", options: [[0, "Sin mínimo"], [30, "30 minutos antes"], [60, "1 hora antes"], [120, "2 horas antes"], [180, "3 horas antes"], [720, "12 horas antes"], [1440, "1 día antes"]] },
    { name: "cancel_limit_min", label: "El cliente puede cancelar online", options: [[0, "Hasta la hora de la cita"], [60, "Hasta 1 hora antes"], [120, "Hasta 2 horas antes"], [180, "Hasta 3 horas antes"], [360, "Hasta 6 horas antes"], [720, "Hasta 12 horas antes"], [1440, "Hasta 1 día antes"]] },
    { name: "max_active_per_phone", label: "Máximo de horas por cliente", options: [[1, "1 hora a la vez"], [2, "2 horas a la vez"], [3, "3 horas a la vez"], [5, "5 horas a la vez"], [10, "10 horas a la vez"]] },
  ];

  function renderRules() {
    const s = Site.settings;
    $("#rulesForm").innerHTML = `
      <label class="switch">
        <input type="checkbox" name="booking_enabled" ${s.booking_enabled !== false ? "checked" : ""}>
        <span class="switch__track"></span><span>Reservas online activas</span>
      </label>
      <p class="step__hint" style="margin:0">Si las pausas (ej. vacaciones), el botón "Reservar" de la página lleva a WhatsApp.</p>
      ${RULES.map((r) => {
        const current = Number(s[r.name]);
        const opts = r.options.some(([v]) => v === current) ? r.options : [...r.options, [current, `${current}`]];
        return `<label class="field"><span>${r.label}</span><select name="${r.name}">
          ${opts.map(([v, t]) => `<option value="${v}" ${v === current ? "selected" : ""}>${t}</option>`).join("")}
        </select></label>`;
      }).join("")}
      <button class="btn btn--light btn--block" type="submit">Guardar reglas</button>`;
  }

  $("#rulesForm").addEventListener("change", (e) => { if (e.target.name === "slot_step_min") updatePreview(); });

  $("#rulesForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const changes = { booking_enabled: f.booking_enabled.checked };
    for (const r of RULES) changes[r.name] = Number(f[r.name].value);
    Admin.busy(e.submitter, async () => {
      const { data, error } = await db.from("settings").update(changes).eq("id", true).select("id");
      if (error || !data?.length) throw new Error("No se pudieron guardar las reglas.");
      Site.settings = { ...Site.settings, ...changes };
      Site.saveCache();
      Admin.toast(changes.booking_enabled ? "Reglas guardadas ✓" : "Reglas guardadas · reservas online pausadas");
    });
  });

  // =====================================================================
  // Servicios (se guardan solos al cambiar algo)
  // =====================================================================
  let services = [];
  const DURATIONS = [15, 20, 30, 40, 45, 50, 60, 75, 90, 105, 120, 150, 180];

  Admin.tabs.services = async () => {
    $("#servicesEditor").innerHTML = '<p class="muted">Cargando…</p>';
    const { data, error } = await db.from("services").select("*").order("sort").order("id");
    if (error) return ($("#servicesEditor").innerHTML = '<p class="muted">No se pudieron cargar los servicios.</p>');
    services = data;
    // Dejamos el orden como 1, 2, 3… para que las flechas funcionen bien
    const fixes = services.map((s, i) => (s.sort !== i + 1 ? db.from("services").update({ sort: i + 1 }).eq("id", s.id) : null)).filter(Boolean);
    services.forEach((s, i) => (s.sort = i + 1));
    if (fixes.length) await Promise.all(fixes);
    renderServices();
  };

  function renderServices() {
    $("#servicesEditor").innerHTML = services.length ? services.map((s, i) => {
      const durs = DURATIONS.includes(s.duration_min) ? DURATIONS : [...DURATIONS, s.duration_min].sort((a, b) => a - b);
      return `
      <article class="step svc ${s.active ? "" : "is-hidden"}" data-id="${s.id}">
        <label class="field"><span>Nombre</span><input data-f="name" value="${esc(s.name)}" maxlength="60"></label>
        <div class="row">
          <label class="field"><span>Duración</span><select data-f="duration_min">
            ${durs.map((m) => `<option value="${m}" ${m === s.duration_min ? "selected" : ""}>${U.duration(m)}</option>`).join("")}
          </select></label>
          <label class="field"><span>Precio</span>
            <div class="field__prefix"><b>$</b><input data-f="price" type="number" inputmode="numeric" min="0" step="500" value="${s.price}"></div>
          </label>
        </div>
        <div class="svc__foot">
          <label class="switch"><input type="checkbox" data-f="featured" ${s.featured ? "checked" : ""}><span class="switch__track"></span><span>Popular</span></label>
          <label class="switch"><input type="checkbox" data-f="active" ${s.active ? "checked" : ""}><span class="switch__track"></span><span>Visible</span></label>
          <div class="svc__tools">
            <button class="icon-btn" type="button" data-act="up" aria-label="Subir" ${i === 0 ? "disabled" : ""}>↑</button>
            <button class="icon-btn" type="button" data-act="down" aria-label="Bajar" ${i === services.length - 1 ? "disabled" : ""}>↓</button>
            <button class="icon-btn icon-btn--danger" type="button" data-act="delete" aria-label="Eliminar">🗑</button>
          </div>
        </div>
      </article>`;
    }).join("") : '<div class="empty">No hay servicios. Agrega el primero.</div>';
  }

  // Actualiza la lista que usa el resto del panel (agenda, vista previa)
  function syncSite() {
    Site.services = services.filter((s) => s.active).map(({ id, name, duration_min, price, featured }) => ({ id, name, duration_min, price, featured }));
    Site.saveCache();
  }

  $("#servicesEditor").addEventListener("change", async (e) => {
    const el = e.target, f = el.dataset.f;
    if (!f) return;
    const card = el.closest(".svc"), id = Number(card.dataset.id);
    const s = services.find((x) => x.id === id);

    let value = el.type === "checkbox" ? el.checked : el.value;
    if (f === "name") {
      value = value.trim();
      if (value.length < 2) { el.value = s.name; return Admin.toast("El nombre es muy corto.", "error"); }
    }
    if (f === "price") {
      value = Math.round(Number(value));
      if (!Number.isFinite(value) || value < 0) { el.value = s.price; return Admin.toast("Revisa el precio.", "error"); }
    }
    if (f === "duration_min") value = Number(value);

    const { data, error } = await db.from("services").update({ [f]: value }).eq("id", id).select("id");
    if (error || !data?.length) return Admin.toast("No se pudo guardar.", "error");
    s[f] = value;
    if (f === "active") card.classList.toggle("is-hidden", !value);
    syncSite();
    Admin.toast("Guardado ✓");
  });

  $("#servicesEditor").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const id = Number(btn.closest(".svc").dataset.id);
    const i = services.findIndex((s) => s.id === id);

    if (btn.dataset.act === "up" || btn.dataset.act === "down") {
      const j = btn.dataset.act === "up" ? i - 1 : i + 1;
      const a = services[i], b = services[j];
      [a.sort, b.sort] = [b.sort, a.sort];
      const [r1, r2] = await Promise.all([
        db.from("services").update({ sort: a.sort }).eq("id", a.id),
        db.from("services").update({ sort: b.sort }).eq("id", b.id),
      ]);
      if (r1.error || r2.error) return Admin.toast("No se pudo cambiar el orden.", "error");
      services.sort((x, y) => x.sort - y.sort);
      renderServices();
      syncSite();
    }

    if (btn.dataset.act === "delete") {
      if (!confirm(`¿Eliminar "${services[i].name}"?`)) return;
      const { error } = await db.from("services").delete().eq("id", id);
      if (error) {
        return Admin.toast(error.code === "23503"
          ? "Este servicio tiene reservas guardadas. En vez de borrarlo, apaga \"Visible\"."
          : "No se pudo eliminar.", "error");
      }
      services.splice(i, 1);
      renderServices();
      syncSite();
      Admin.toast("Servicio eliminado");
    }
  });

  $("#addService").addEventListener("click", (e) => {
    Admin.busy(e.currentTarget, async () => {
      const sort = services.length ? Math.max(...services.map((s) => s.sort)) + 1 : 1;
      const { data, error } = await db.from("services")
        .insert({ name: "Nuevo servicio", duration_min: 45, price: 10000, sort })
        .select().single();
      if (error) throw new Error("No se pudo agregar el servicio.");
      services.push(data);
      renderServices();
      syncSite();
      const input = $(`.svc[data-id="${data.id}"] [data-f="name"]`);
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      input.select();
      Admin.toast("Servicio agregado. Cámbiale el nombre y el precio.");
    }, "Agregando…");
  });

  // =====================================================================
  // Cuenta
  // =====================================================================
  $("#passForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const err = (msg) => { $("#passError").textContent = msg; $("#passError").hidden = false; };
    $("#passError").hidden = true;
    if (f.p1.value.length < 8) return err("La clave debe tener al menos 8 caracteres.");
    if (f.p1.value !== f.p2.value) return err("Las dos claves no son iguales.");
    Admin.busy(e.submitter, async () => {
      const { error } = await db.auth.updateUser({ password: f.p1.value });
      if (error) return err(/different/i.test(error.message) ? "La clave nueva debe ser distinta a la actual." : "No se pudo cambiar la clave.");
      e.target.reset();
      Admin.toast("Clave cambiada ✓ Guárdala en un lugar seguro.");
    });
  });
})();
