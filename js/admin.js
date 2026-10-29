// Panel de Anderson · parte 1: sesión, pestañas, agenda y bloqueos.
// Las otras pestañas están en admin-ajustes.js y admin-pagina.js
(function () {
  const C = window.SITE_CONFIG, Site = window.Site, db = window.db, U = window.U, { $, $$, esc } = U;
  const TABS = ["agenda", "blocks", "hours", "services", "page", "design", "account"];
  const STATUS = { confirmed: "Confirmada", completed: "Llegó", no_show: "No vino", cancelled: "Cancelada" };

  // Lo que comparten los tres archivos del panel
  const Admin = (window.Admin = {
    tabs: {},        // cada pestaña registra aquí su función para cargarse
    barberId: null,
    user: null,

    toast(msg, type = "ok") {
      const t = $("#toast");
      t.textContent = msg;
      t.className = `toast${type === "error" ? " toast--error" : ""}`;
      t.hidden = false;
      clearTimeout(t._timer);
      t._timer = setTimeout(() => (t.hidden = true), type === "error" ? 5000 : 2200);
    },

    // Desactiva el botón mientras se guarda y muestra el error si algo falla
    async busy(btn, fn, label = "Guardando…") {
      const old = btn ? btn.textContent : "";
      if (btn) { btn.disabled = true; btn.textContent = label; }
      try {
        return await fn();
      } catch (e) {
        Admin.toast(e.message || "Algo falló. Intenta de nuevo.", "error");
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = old; }
      }
    },

    show,
  });

  if (!db) {
    $("#fatal").textContent = "Falta conectar Supabase en js/config.js.";
    $("#fatal").hidden = false;
    return;
  }

  // ---------- Sesión ----------
  async function start() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return showLogin();

    // ¿Esta cuenta está en la tabla admins?
    const { data: admin } = await db.from("admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
    if (!admin) {
      await db.auth.signOut();
      return showLogin("Esta cuenta no tiene acceso al panel.");
    }

    Admin.user = session.user;
    await Site.load({ services: true, hours: true, settings: true });
    const { data: barbers } = await db.from("barbers").select("id").order("id").limit(1);
    Admin.barberId = barbers?.[0]?.id ?? 1;
    Site.bindTexts();
    $("#whoami").textContent = session.user.email.replace(`@${C.adminDomain}`, "");

    $("#login").hidden = true;
    $("#app").hidden = false;
    $("#viewSite").hidden = false;
    show(location.hash.slice(1));
  }

  function showLogin(msg) {
    $("#app").hidden = true;
    $("#viewSite").hidden = true;
    $("#login").hidden = false;
    $("#loginError").hidden = !msg;
    if (msg) $("#loginError").textContent = msg;
  }

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const user = f.user.value.trim().toLowerCase();
    const email = user.includes("@") ? user : `${user}@${C.adminDomain}`;
    const { error } = await db.auth.signInWithPassword({ email, password: f.pass.value });
    if (error) return showLogin("Usuario o clave incorrectos.");
    f.pass.value = "";
    start();
  });

  $("#logoutBtn").addEventListener("click", async () => {
    await db.auth.signOut();
    showLogin();
  });

  // ---------- Pestañas ----------
  function show(name) {
    if (!TABS.includes(name)) name = "agenda";
    $$(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === name));
    $$("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== name));
    history.replaceState(null, "", `#${name}`);
    $(`.tab[data-tab="${name}"]`).scrollIntoView({ block: "nearest", inline: "center" });
    const load = name === "agenda" ? loadAgenda : name === "blocks" ? loadBlocks : Admin.tabs[name];
    if (load) load();
  }

  $(".tabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (tab) show(tab.dataset.tab);
  });

  // ---------- Agenda ----------
  let day = U.todayISO();

  $("#prevDay").addEventListener("click", () => { day = U.addDays(day, -1); loadAgenda(); });
  $("#nextDay").addEventListener("click", () => { day = U.addDays(day, 1); loadAgenda(); });
  $("#todayBtn").addEventListener("click", () => { day = U.todayISO(); loadAgenda(); });
  $("#dayPicker").addEventListener("click", (e) => { try { e.target.showPicker(); } catch {} });
  $("#dayPicker").addEventListener("change", (e) => { if (e.target.value) { day = e.target.value; loadAgenda(); } });

  function dayName(iso) {
    const today = U.todayISO();
    if (iso === today) return "Hoy";
    if (iso === U.addDays(today, 1)) return "Mañana";
    if (iso === U.addDays(today, -1)) return "Ayer";
    return U.capitalize(U.weekday(U.dateFromISO(iso)));
  }

  async function loadAgenda() {
    $("#dayTitle").textContent = dayName(day);
    $("#daySub").textContent = U.longDate(U.dateFromISO(day));
    $("#dayPicker").value = day;
    $("#todayBtn").hidden = day === U.todayISO();
    $("#agenda").innerHTML = '<p class="muted">Cargando…</p>';

    const { data, error } = await db
      .from("bookings")
      .select("id, starts_at, customer_name, customer_phone, price, status, reminder_sent_at, cancel_token, services(name, duration_min)")
      .gte("starts_at", U.localToISO(day, "00:00"))
      .lt("starts_at", U.localToISO(U.addDays(day, 1), "00:00"))
      .order("starts_at");

    if (error) return ($("#agenda").innerHTML = '<p class="muted">No se pudo cargar la agenda.</p>');

    const active = data.filter((b) => b.status !== "cancelled");
    const total = active.filter((b) => b.status !== "no_show").reduce((sum, b) => sum + b.price, 0);
    $("#stats").innerHTML = `
      <div><strong>${active.length}</strong><span>${active.length === 1 ? "cliente" : "clientes"}</span></div>
      <div><strong>${U.clp.format(total)}</strong><span>estimado</span></div>`;

    $("#agenda").innerHTML = data.length
      ? data.map(card).join("")
      : '<div class="empty">Sin reservas este día 😎</div>';
  }

  function card(b) {
    const past = new Date(b.starts_at) < new Date();
    const phone = (b.customer_phone || "").replace(/^\+56/, "").replace(/^(\d)(\d{4})(\d{4})$/, "$1 $2 $3");
    return `
      <article class="appt appt--${b.status}" data-id="${b.id}">
        <div class="appt__time">${U.time(b.starts_at)}</div>
        <div class="appt__body">
          <div class="appt__head">
            <strong>${esc(b.customer_name)}</strong>
            <span class="badge badge--${b.status}">${STATUS[b.status]}</span>
          </div>
          <p class="muted">${esc(b.services?.name || "Servicio")} · ${U.clp.format(b.price)}</p>
          ${b.customer_phone
            ? `<a class="appt__phone" href="tel:${esc(b.customer_phone)}">${esc(phone)}</a>`
            : '<span class="muted" style="font-size:.85rem">Sin teléfono</span>'}
          ${b.status === "confirmed" ? `
          <div class="appt__actions">
            ${!past && b.customer_phone ? `<button class="btn btn--sm ${b.reminder_sent_at ? "btn--ghost" : "btn--wa"}" data-act="remind">
              ${b.reminder_sent_at ? "✓ Recordado" : "Recordar por WhatsApp"}</button>` : ""}
            <button class="btn btn--ghost btn--sm" data-act="completed">Llegó</button>
            <button class="btn btn--ghost btn--sm" data-act="no_show">No vino</button>
            ${!past ? '<button class="btn btn--ghost btn--sm btn--danger" data-act="cancelled">Cancelar</button>' : ""}
          </div>` : `
          <div class="appt__actions">
            <button class="btn btn--ghost btn--sm" data-act="confirmed">Deshacer</button>
          </div>`}
        </div>
      </article>`;
  }

  $("#agenda").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const id = btn.closest(".appt").dataset.id;
    const act = btn.dataset.act;

    if (act === "remind") return remind(id);
    if (act === "cancelled" && !confirm("¿Cancelar esta reserva? La hora queda libre para otro cliente.")) return;

    const changes = { status: act, cancelled_at: act === "cancelled" ? new Date().toISOString() : null };
    btn.disabled = true;
    const { error } = await db.from("bookings").update(changes).eq("id", id);
    if (error) {
      Admin.toast(act === "confirmed" ? "No se pudo deshacer: esa hora ya la tomó otro cliente." : "No se pudo guardar.", "error");
    }
    loadAgenda();
  });

  async function remind(id) {
    const { data: b } = await db
      .from("bookings")
      .select("starts_at, customer_name, customer_phone, cancel_token, services(name)")
      .eq("id", id)
      .single();
    if (!b) return;

    const c = Site.content, contact = c.contact || {};
    const bookingDay = U.dayISO(b.starts_at);
    const when = bookingDay === U.todayISO() ? "hoy"
      : bookingDay === U.addDays(U.todayISO(), 1) ? "mañana"
      : `el ${U.longDate(b.starts_at)}`;
    const link = new URL(`reserva.html?t=${b.cancel_token}`, location.href).href;
    const firstName = b.customer_name.split(" ")[0];
    const text =
      `Hola ${firstName} 👋 te recuerdo tu hora ${when} a las ${U.time(b.starts_at)} en ${c.brand.name} (${b.services?.name}).\n` +
      `📍 ${[contact.address, contact.commune].filter(Boolean).join(", ")}\n` +
      `Si no puedes venir, cancela aquí: ${link}`;

    // Abrimos WhatsApp primero (los celulares bloquean ventanas abiertas después de esperar)
    window.open(U.waLink(text, b.customer_phone), "_blank");
    await db.from("bookings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", id);
    loadAgenda();
  }

  // ---------- Reserva manual (clientes que llegan o escriben por WhatsApp) ----------
  const dialog = $("#bookingDialog"), bform = $("#bookingForm");

  $("#addBooking").addEventListener("click", () => {
    const services = Site.services || [];
    if (!services.length) return Admin.toast("Primero agrega un servicio en la pestaña Servicios.", "error");
    bform.reset();
    bform.elements.service.innerHTML = services.map((s) =>
      `<option value="${s.id}">${esc(s.name)} · ${U.clp.format(s.price)}</option>`).join("");
    bform.elements.date.value = day;
    const now = U.nowInTz();
    bform.elements.time.value = U.fromMin(Math.min(23 * 60, Math.ceil((now.minutes + 1) / 60) * 60));
    $("#bookingError").hidden = true;
    dialog.showModal();
    bform.elements.name.focus();
  });
  $("#bookingCancel").addEventListener("click", () => dialog.close());

  bform.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = bform.elements;
    const err = (msg) => { $("#bookingError").textContent = msg; $("#bookingError").hidden = false; };
    const name = f.name.value.trim();
    const phone = f.phone.value.replace(/\D/g, "");
    const svc = (Site.services || []).find((s) => String(s.id) === f.service.value);
    if (name.length < 2) return err("Escribe el nombre del cliente.");
    if (phone && !/^9\d{8}$/.test(phone)) return err("El teléfono debe tener 9 dígitos y empezar con 9.");
    if (!svc || !f.date.value || !f.time.value) return err("Elige servicio, día y hora.");

    const start = new Date(U.localToISO(f.date.value, f.time.value));
    const end = new Date(start.getTime() + svc.duration_min * 60000);
    const block = new Date(end.getTime() + (Site.settings.buffer_min || 0) * 60000);

    await Admin.busy($("#bookingSave"), async () => {
      const { error } = await db.from("bookings").insert({
        barber_id: Admin.barberId,
        service_id: svc.id,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        block_until: block.toISOString(),
        customer_name: name,
        customer_phone: phone ? `+56${phone}` : null,
        price: svc.price,
      });
      if (error) {
        return err(error.code === "23P01" ? "Ya hay una reserva que se cruza con esa hora." : "No se pudo guardar la reserva.");
      }
      dialog.close();
      day = f.date.value;
      loadAgenda();
      Admin.toast("Reserva agregada ✓");
    });
  });

  // ---------- Bloqueos ----------
  const blockForm = $("#blockForm");
  blockForm.elements.date.value = U.todayISO();
  blockForm.elements.allDay.addEventListener("change", (e) => ($("#blockTimes").hidden = e.target.checked));

  blockForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = blockForm.elements;
    const err = (msg) => { $("#blockError").textContent = msg; $("#blockError").hidden = false; };
    $("#blockError").hidden = true;

    const date = f.date.value;
    const starts_at = U.localToISO(date, f.allDay.checked ? "00:00" : f.from.value);
    const ends_at = f.allDay.checked ? U.localToISO(U.addDays(date, 1), "00:00") : U.localToISO(date, f.to.value);
    if (new Date(ends_at) <= new Date(starts_at)) return err("La hora 'hasta' debe ser después de 'desde'.");

    const { error } = await db.from("time_off").insert({
      barber_id: Admin.barberId,
      starts_at,
      ends_at,
      reason: f.reason.value.trim() || null,
    });
    if (error) return err("No se pudo guardar el bloqueo.");
    f.reason.value = "";
    Admin.toast("Horario bloqueado ✓");
    loadBlocks();
  });

  async function loadBlocks() {
    $("#blocks").innerHTML = '<p class="muted">Cargando…</p>';
    const { data, error } = await db
      .from("time_off")
      .select("id, starts_at, ends_at, reason")
      .gte("ends_at", new Date().toISOString())
      .order("starts_at");
    if (error) return ($("#blocks").innerHTML = '<p class="muted">No se pudieron cargar.</p>');

    $("#blocks").innerHTML = data.length
      ? data.map((b) => {
          const allDay = U.time(b.starts_at) === "00:00" && U.time(b.ends_at) === "00:00";
          return `
          <div class="block" data-id="${b.id}">
            <div>
              <strong>${U.longDate(b.starts_at)}</strong>
              <span class="muted">${allDay ? "Todo el día" : `${U.time(b.starts_at)} – ${U.time(b.ends_at)}`}${b.reason ? ` · ${esc(b.reason)}` : ""}</span>
            </div>
            <button class="btn btn--ghost btn--sm btn--danger" data-del>Quitar</button>
          </div>`;
        }).join("")
      : '<div class="empty">No hay bloqueos próximos.</div>';
  }

  $("#blocks").addEventListener("click", async (e) => {
    if (!e.target.closest("[data-del]")) return;
    const id = e.target.closest(".block").dataset.id;
    await db.from("time_off").delete().eq("id", id);
    Admin.toast("Bloqueo quitado");
    loadBlocks();
  });

  // Esperamos a que carguen los otros archivos del panel antes de empezar
  window.addEventListener("DOMContentLoaded", start);
})();
