// Herramientas compartidas por las páginas de reservas
(function () {
  const S = window.SITE;
  const tz = S.timezone;

  window.U = {
    $: (sel) => document.querySelector(sel),

    clp: new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }),

    duration(min) {
      const h = Math.floor(min / 60), m = min % 60;
      if (!h) return `${m} min`;
      return m ? `${h} h ${m} min` : `${h} h`;
    },

    // "2026-10-07" -> Date al mediodía UTC (cae el mismo día en Chile)
    dateFromISO: (iso) => new Date(`${iso}T12:00:00Z`),

    time: (d) => new Intl.DateTimeFormat("es-CL", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(d)),
    longDate: (d) => new Intl.DateTimeFormat("es-CL", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(d)),
    weekday: (d) => new Intl.DateTimeFormat("es-CL", { timeZone: tz, weekday: "short" }).format(new Date(d)).replace(".", ""),
    dayNum: (d) => new Intl.DateTimeFormat("es-CL", { timeZone: tz, day: "numeric" }).format(new Date(d)),
    month: (d) => new Intl.DateTimeFormat("es-CL", { timeZone: tz, month: "short" }).format(new Date(d)).replace(".", ""),

    waLink: (text, phone = S.whatsapp) => `https://wa.me/${String(phone).replace(/\D/g, "")}?text=${encodeURIComponent(text)}`,

    // Fechas como texto "AAAA-MM-DD" en hora de Chile
    todayISO: () => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()),
    addDays(iso, n) {
      const d = new Date(`${iso}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    },
    // Diferencia horaria de Chile ese día ("-03:00" o "-04:00", cambia con el horario de verano)
    tzOffset(iso) {
      const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
        .formatToParts(new Date(`${iso}T12:00:00Z`))
        .find((p) => p.type === "timeZoneName").value; // "GMT-03:00"
      return name === "GMT" ? "+00:00" : name.replace("GMT", "");
    },
    // "2026-10-07" + "14:30" -> "2026-10-07T14:30:00-03:00"
    localToISO(iso, hhmm) {
      return `${iso}T${hhmm}:00${window.U.tzOffset(iso)}`;
    },

    // Link para que el cliente agregue la cita a su Google Calendar (recordatorio gratis)
    calendarLink(title, start, minutes) {
      const fmt = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
      const s = new Date(start), e = new Date(s.getTime() + minutes * 60000);
      const p = new URLSearchParams({
        action: "TEMPLATE",
        text: title,
        dates: `${fmt(s)}/${fmt(e)}`,
        location: `${S.address}, ${S.commune}`,
      });
      return `https://calendar.google.com/calendar/render?${p}`;
    },

    // Texto seguro para meter en HTML
    esc: (str) => String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
  };

  // Conexión a Supabase (null si todavía no está configurado)
  window.db = S.supabaseUrl && S.supabaseAnonKey && window.supabase
    ? window.supabase.createClient(S.supabaseUrl, S.supabaseAnonKey)
    : null;
})();
