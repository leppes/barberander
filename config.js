// =====================================================================
// Conexión y contenido por defecto.
// El contenido real (textos, fotos, colores, precios, horario) se edita
// desde el panel (admin.html) y se guarda en Supabase. Lo de abajo es solo
// el respaldo por si la base de datos no responde.
// =====================================================================

window.SITE_CONFIG = {
  // Ambos datos son públicos: la seguridad la ponen las reglas RLS de Supabase
  supabaseUrl: "https://ndaqwjqnxwdgwqwosgns.supabase.co",
  supabaseAnonKey: "sb_publishable_D9Zn2qwGI-YEZWC7eGJGIA_yy5I_QMu",
  // El panel pide solo "usuario"; por dentro se convierte en usuario@adminDomain
  adminDomain: "xanderhome.local",
  timezone: "America/Santiago",
};

window.SITE_DEFAULTS = {
  content: {
    brand: { name: "Xander Home", logo1: "XANDER", logo2: "HOME", tagline: "Barbería en San Ramón" },
    theme: {
      preset: "noche",
      bg: "#0e0e0e",
      surface: "#1b1b1b",
      text: "#f2f2f2",
      muted: "#9b9b9b",
      accent: "#ffffff",
      accentText: "#0e0e0e",
      fontHead: "Inter",
      fontBody: "Inter",
      radius: "round",
      heroShade: 0.75,
      stripes: true,
    },
    hero: {
      title: "Tu estilo,\nen buenas manos.",
      lead: "Cortes, barba y cejas con Anderson Muñoz. Reserva tu hora en segundos.",
      cta: "Reservar hora",
      showWhatsapp: true,
      image: "",
      facts: [
        { big: "5", small: "servicios" },
        { big: "Lun–Sáb", small: "atención" },
        { big: "San Ramón", small: "Santiago" },
      ],
    },
    sections: {
      services: { show: true, eyebrow: "Servicios", title: "Elige tu servicio" },
      barber: { show: true, eyebrow: "Tu barbero", cta: "Reservar con Anderson" },
      gallery: { show: true, eyebrow: "Galería", title: "Trabajos recientes" },
      location: { show: true, eyebrow: "Horario", title: "Cuándo atendemos" },
      cta: {
        show: true,
        title: "¿Listo para tu próximo corte?",
        text: "Elige el día y la hora que te acomode.",
        button: "Reservar hora",
      },
    },
    barber: {
      name: "Anderson Muñoz",
      bio: "Cortes clásicos y modernos, degradados, perfilado de barba y cejas. Atención personalizada, sin apuro y con el detalle que marca la diferencia.",
      highlights: ["Degradados", "Barba", "Cejas", "Diseño"],
      photo: "img/barbero.jpg",
    },
    gallery: ["img/galeria-1.jpg", "img/galeria-2.jpg", "img/galeria-3.jpg", "img/galeria-4.jpg"],
    booking: {
      title: "Reserva tu hora",
      lead: "Elige servicio, día y hora. Te toma menos de un minuto.",
      doneTitle: "¡Hora reservada!",
    },
    contact: {
      phoneDisplay: "+56 9 7880 1968",
      whatsapp: "56978801968",
      whatsappMessage: "Hola Anderson, quiero agendar una hora en Xander Home 💈",
      showFloat: true,
      instagram: "",
      tiktok: "",
      address: "Augusto D'halmar 1962",
      commune: "San Ramón, Santiago",
    },
  },

  // Respaldo de servicios y horario (lo real viene de la base de datos)
  services: [
    { id: 1, name: "Corte de Cabello", duration_min: 45, price: 12000, featured: false },
    { id: 2, name: "Barba", duration_min: 45, price: 10000, featured: false },
    { id: 3, name: "Corte + Cejas", duration_min: 60, price: 14000, featured: false },
    { id: 4, name: "Corte + Barba", duration_min: 90, price: 20000, featured: true },
    { id: 5, name: "Corte + Barba + Cejas", duration_min: 90, price: 22000, featured: false },
  ],
  // 0 = domingo ... 6 = sábado. Cada día puede tener varios tramos.
  hours: {
    0: [],
    1: [["10:00", "21:00"]],
    2: [["10:00", "21:00"]],
    3: [["10:00", "21:00"]],
    4: [["10:00", "21:00"]],
    5: [["10:00", "21:00"]],
    6: [["10:00", "21:00"]],
  },
  settings: {
    booking_enabled: true,
    slot_step_min: 60,
    buffer_min: 0,
    max_days_ahead: 30,
    min_notice_min: 60,
    cancel_limit_min: 180,
    max_active_per_phone: 2,
    email_confirm: true,
    email_reminder: true,
    reminder_hours: 2,
    email_barber: true,
    require_email: true,
    site_url: null,
  },
};
