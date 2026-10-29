// Herramientas compartidas por todas las páginas
(function () {
  const C = window.SITE_CONFIG;
  const tz = C.timezone;
  const fmt = (opts) => new Intl.DateTimeFormat("es-CL", { timeZone: tz, ...opts });
  const F = {
    time: fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    long: fmt({ weekday: "long", day: "numeric", month: "long" }),
    weekday: fmt({ weekday: "short" }),
    day: fmt({ day: "numeric" }),
    month: fmt({ month: "short" }),
    iso: new Intl.DateTimeFormat("en-CA", { timeZone: tz }),
  };

  const U = {
    $: (sel, root = document) => root.querySelector(sel),
    $$: (sel, root = document) => [...root.querySelectorAll(sel)],

    // Texto seguro para meter en HTML
    esc: (str) => String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),

    clp: new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }),

    duration(min) {
      const h = Math.floor(min / 60), m = min % 60;
      if (!h) return `${m} min`;
      return m ? `${h} h ${m} min` : `${h} h`;
    },

    // "10:30" <-> 630 minutos
    toMin: (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + m; },
    fromMin: (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`,

    capitalize: (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1),

    // "2026-10-07" -> Date al mediodía UTC (cae el mismo día en Chile)
    dateFromISO: (iso) => new Date(`${iso}T12:00:00Z`),

    time: (d) => F.time.format(new Date(d)),
    longDate: (d) => F.long.format(new Date(d)),
    weekday: (d) => F.weekday.format(new Date(d)).replace(".", ""),
    dayNum: (d) => F.day.format(new Date(d)),
    month: (d) => F.month.format(new Date(d)).replace(".", ""),

    // Fechas como texto "AAAA-MM-DD" en hora de Chile
    dayISO: (d) => F.iso.format(new Date(d)),
    todayISO: () => F.iso.format(new Date()),
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
    localToISO: (iso, hhmm) => `${iso}T${hhmm}:00${U.tzOffset(iso)}`,

    // Día de la semana (0 = domingo) y minutos desde medianoche, en Chile
    nowInTz() {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(new Date());
      const get = (t) => parts.find((p) => p.type === t).value;
      return {
        day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
        minutes: parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10),
      };
    },

    waLink: (text, phone) => `https://wa.me/${String(phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(text || "")}`,

    // Link para que el cliente agregue la cita a su Google Calendar (recordatorio gratis)
    calendarLink(title, start, minutes, location) {
      const f = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
      const s = new Date(start), e = new Date(s.getTime() + minutes * 60000);
      const p = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${f(s)}/${f(e)}`, location: location || "" });
      return `https://calendar.google.com/calendar/render?${p}`;
    },

    // Solo deja pasar links https o fotos de la carpeta img/ (evita código malicioso en estilos)
    safeUrl(url) {
      if (typeof url !== "string") return "";
      const u = url.trim();
      if (/^https:\/\/[^\s"'<>()\\]+$/i.test(u)) return u;
      if (/^img\/[\w\-./]+$/i.test(u) && !u.includes("..")) return u;
      return "";
    },
  };

  window.U = U;

  // Conexión a Supabase (null si no está configurado)
  window.db = C.supabaseUrl && C.supabaseAnonKey && window.supabase
    ? window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey)
    : null;
})();
