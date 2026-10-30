// Site shell — hash routing, mobile navigation, and small page details.
(function () {
  const ROUTES = ["calculator", "dice", "draw", "snake", "minesweeper", "chess"];
  const TITLES = {
    home: "Simple — a tiny arcade of tools",
    calculator: "Calculator — Simple",
    dice: "Dice roller — Simple",
    draw: "Drawing canvas — Simple",
    snake: "Snake — Simple",
    minesweeper: "Minesweeper — Simple",
    chess: "Chess — Simple",
  };

  const views = { home: document.getElementById("view-home") };
  ROUTES.forEach((route) => {
    views[route] = document.getElementById("view-" + route);
  });

  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.getElementById("nav-links");
  const routeLinks = document.querySelectorAll("[data-route]");
  const yearEl = document.getElementById("year");

  let current = null;

  function closeNav() {
    navLinks.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  }

  function readRoute() {
    const raw = location.hash.replace(/^#\/?/, "").trim();
    return ROUTES.includes(raw) ? raw : "home";
  }

  function navigate() {
    const route = readRoute();

    if (route === current) {
      closeNav();
      return;
    }

    if (current && window.Tools && window.Tools[current] && window.Tools[current].leave) {
      window.Tools[current].leave();
    }

    Object.entries(views).forEach(([name, element]) => {
      if (element) element.hidden = name !== route;
    });

    current = route;
    document.title = TITLES[route] || TITLES.home;

    routeLinks.forEach((link) => {
      const isActive = link.dataset.route === route;
      link.classList.toggle("active", isActive);
      if (isActive) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    window.scrollTo(0, 0);
    closeNav();

    if (window.Tools && window.Tools[route] && window.Tools[route].enter) {
      window.Tools[route].enter();
    }
  }

  navToggle.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(open));
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeNav);
  });

  window.addEventListener("hashchange", navigate);

  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Fade the home cards in as they enter the viewport.
  const revealTargets = document.querySelectorAll(".tool-link");
  revealTargets.forEach((element) => element.classList.add("reveal"));

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    revealTargets.forEach((element) => observer.observe(element));
  } else {
    revealTargets.forEach((element) => element.classList.add("is-visible"));
  }

  navigate();
})();
