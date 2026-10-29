(async function () {
  const Site = window.Site, db = window.db, U = window.U, { $, esc } = U;
  const box = $("#box");
  const token = new URLSearchParams(location.search).get("t");

  const STATUS = {
    confirmed: "Confirmada",
    cancelled: "Cancelada",
    completed: "Atendida",
    no_show: "No asistió",
  };

  const message = (html) => (box.innerHTML = html);

  Site.bindTexts();
  if (!db) return message('<p class="muted">Las reservas online todavía no están activas.</p>');
  if (!token) return message('<p class="muted">Link inválido. Revisa que lo hayas copiado completo.</p>');
  Site.load().then(() => {
    Site.bindTexts();
    document.title = `Mi reserva | ${Site.content.brand.name}`;
  });

  async function load() {
    const { data, error } = await db.rpc("get_booking", { p_token: token });
    if (error || !data.length) {
      return message(`<p class="muted">No encontramos esta reserva.</p>
        <a class="btn btn--light" href="reservar.html">Reservar una hora</a>`);
    }
    render(data[0]);
  }

  function render(b) {
    const barber = String(b.barber_name || "").split(" ")[0];
    const waCancel = Site.wa(`Hola ${barber}, necesito cancelar mi hora del ${U.longDate(b.starts_at)} a las ${U.time(b.starts_at)}.`);
    message(`
      <span class="badge badge--${b.status}">${STATUS[b.status] || esc(b.status)}</span>
      <div class="summary">
        <div><span>Nombre</span><strong>${esc(b.customer_name)}</strong></div>
        <div><span>Servicio</span><strong>${esc(b.service_name)}</strong></div>
        <div><span>Día</span><strong>${U.longDate(b.starts_at)}</strong></div>
        <div><span>Hora</span><strong>${U.time(b.starts_at)}</strong></div>
        <div><span>Precio</span><strong>${U.clp.format(b.price)}</strong></div>
      </div>
      <div class="notice notice--error" id="err" hidden></div>
      <div class="done__actions">
        ${b.can_cancel ? `
          <button class="btn btn--ghost btn--block" id="cancelBtn">Cancelar mi hora</button>
          <p class="muted small">¿Quieres cambiarla? Cancela esta y reserva otra.</p>` : ""}
        ${b.status === "confirmed" && !b.can_cancel ? `
          <p class="muted small">Ya pasó el plazo para cancelar online. Si no puedes venir, avísale a ${esc(barber)}.</p>
          <a class="btn btn--ghost btn--block" href="${esc(waCancel)}" target="_blank" rel="noopener">Avisar por WhatsApp</a>` : ""}
        ${b.status !== "confirmed" ? `<a class="btn btn--light btn--block" href="reservar.html">Reservar otra hora</a>` : ""}
      </div>`);

    const btn = $("#cancelBtn");
    if (btn) btn.addEventListener("click", cancel);
  }

  async function cancel() {
    if (!confirm("¿Seguro que quieres cancelar tu hora?")) return;
    const btn = $("#cancelBtn");
    btn.disabled = true;
    btn.textContent = "Cancelando…";
    const { error } = await db.rpc("cancel_booking", { p_token: token });
    if (error) {
      $("#err").textContent = error.message;
      $("#err").hidden = false;
      btn.disabled = false;
      btn.textContent = "Cancelar mi hora";
      return;
    }
    db.functions.invoke("avisos", { body: {} }).catch(() => {}); // avisa a Anderson al instante
    load();
  }

  load();
})();
