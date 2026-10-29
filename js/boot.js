// Se ejecuta antes de pintar la página: aplica los colores y la tipografía
// guardados la última vez, para que no se vea un "parpadeo" de otro color.
(function () {
  var root = document.documentElement;
  try {
    var t = JSON.parse(localStorage.getItem("xh_theme"));
    if (t && t.vars) for (var k in t.vars) root.style.setProperty(k, t.vars[k]);
    var link = document.getElementById("theme-fonts");
    if (t && t.fonts && link) link.href = t.fonts;
  } catch (e) {}

  // En la portada, la primera vez esperamos los textos reales (máximo 2,5 s)
  if (root.hasAttribute("data-wait")) {
    var cached = null;
    try { cached = localStorage.getItem("xh_cache"); } catch (e) {}
    if (!cached) {
      root.classList.add("xh-wait");
      setTimeout(function () { root.classList.remove("xh-wait"); }, 2500);
    }
  }
})();
