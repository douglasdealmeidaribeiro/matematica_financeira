(function () {
  "use strict";

  const analyticsId = "G-9JBQT843QK";
  if (!document.querySelector("script[data-google-analytics]")) {
    const analyticsScript = document.createElement("script");
    analyticsScript.async = true;
    analyticsScript.src = `https://www.googletagmanager.com/gtag/js?id=${analyticsId}`;
    analyticsScript.dataset.googleAnalytics = analyticsId;
    document.head.appendChild(analyticsScript);

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", analyticsId);
  }

  const body = document.body;
  const root = body.dataset.root || ".";
  const page = body.dataset.page || "";
  const modules = [
    ["juros-simples", "Juros Simples"], ["juros-compostos", "Juros Compostos"],
    ["amortizacao", "Amortização"], ["taxas", "Taxas de Juros"],
    ["series-diferidas", "Séries Diferidas"], ["previdencia", "Previdência"],
    ["desconto-comercial", "Desconto Comercial"], ["equivalencia-fluxos", "Equivalência de Fluxos"],
    ["vpl", "VPL"], ["hp12c", "HP 12C"]
  ];
  const url = (path) => `${root}/${path}`.replace("././", "./");

  const header = document.getElementById("site-header");
  if (header) {
    const moduleLinks = modules.map(([slug, name]) =>
      `<a href="${url(`pages/${slug}.html`)}"${page === slug ? ' aria-current="page"' : ""}>${name}</a>`
    ).join("");
    header.innerHTML = `
      <header class="site-header">
        <div class="container nav-wrap">
          <a class="brand" href="${url("index.html")}" aria-label="Matemática Financeira Interativa — início">
            <span class="brand-mark">ƒ</span><span>Matemática Financeira<small>APRENDIZADO INTERATIVO</small></span>
          </a>
          <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="main-nav" aria-label="Abrir menu">☰</button>
          <nav class="main-nav" id="main-nav" aria-label="Navegação principal">
            <a href="${url("index.html")}"${page === "home" ? ' aria-current="page"' : ""}>Início</a>
            <a href="${url("index.html#modulos")}">Trilha</a>
            <a href="${url("index.html#sobre")}">Sobre</a>
            <div class="nav-dropdown">
              <button type="button" aria-expanded="false">Módulos ▾</button>
              <div class="dropdown-menu">${moduleLinks}</div>
            </div>
            <a href="${url("pages/hp12c.html")}">HP 12C</a>
          </nav>
        </div>
      </header>`;
    const toggle = header.querySelector(".nav-toggle");
    const nav = header.querySelector(".main-nav");
    const dropdown = header.querySelector(".nav-dropdown");
    const dropdownButton = dropdown.querySelector("button");
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    dropdownButton.addEventListener("click", () => {
      const open = dropdown.classList.toggle("open");
      dropdownButton.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (event) => {
      if (!dropdown.contains(event.target)) {
        dropdown.classList.remove("open");
        dropdownButton.setAttribute("aria-expanded", "false");
      }
    });
  }

  const footer = document.getElementById("site-footer");
  if (footer) {
    footer.innerHTML = `
      <footer class="site-footer">
        <div class="container footer-grid">
          <div><a class="brand" href="${url("index.html")}"><span class="brand-mark">ƒ</span><span style="color:white">Matemática Financeira</span></a>
          <p>Projeto desenvolvido pelo Professor Douglas de Almeida Ribeiro.</p></div>
          <div><p>Projeto educacional · <span data-current-year></span></p><div class="footer-links"><a href="${url("index.html#modulos")}">Módulos</a><a href="${url("index.html#sobre")}">Sobre</a><a href="mailto:douglasdealmeidaribeiro@gmail.com">Contato</a></div><p><a class="footer-email" href="mailto:douglasdealmeidaribeiro@gmail.com">douglasdealmeidaribeiro@gmail.com</a></p></div>
        </div>
      </footer>`;
  }
  document.querySelectorAll("[data-current-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
