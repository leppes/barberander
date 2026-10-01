// Datos del negocio. Edita aquí y se actualiza toda la página.
window.SITE = {
  name: "Xander Home",
  tagline: "Barbería en San Ramón",
  barber: {
    name: "Anderson Muñoz",
    role: "Barbero",
    bio: "Cortes clásicos y modernos, degradados, perfilado de barba y cejas. Atención personalizada, sin apuro y con el detalle que marca la diferencia.",
    highlights: ["Degradados", "Barba", "Cejas", "Diseño"],
  },
  phoneDisplay: "+56 9 7880 1968",
  whatsapp: "56978801968",
  whatsappMessage: "Hola Anderson, quiero agendar una hora en Xander Home 💈",
  instagram: "", // ej: "https://instagram.com/xanderhome"
  address: "Augusto D'halmar 1962",
  commune: "San Ramón, Santiago",
  // Mientras no esté listo el sistema propio (etapa 2), reservar apunta a Setmore.
  bookingUrl: "https://reserva-aqui.setmore.com/",
  timezone: "America/Santiago",
  // 0 = domingo ... 6 = sábado. null = cerrado.
  hours: {
    0: null,
    1: ["Por definir"],
    2: ["Por definir"],
    3: ["Por definir"],
    4: ["Por definir"],
    5: ["Por definir"],
    6: ["Por definir"],
  },
  services: [
    { name: "Corte de Cabello", duration: 45, price: 12000 },
    { name: "Barba", duration: 45, price: 10000 },
    { name: "Corte + Cejas", duration: 60, price: 14000 },
    { name: "Corte + Barba", duration: 90, price: 20000, featured: true },
    { name: "Corte + Barba + Cejas", duration: 90, price: 22000 },
  ],
  gallery: 6, // cantidad de fotos: img/galeria-1.jpg ... img/galeria-6.jpg
};
