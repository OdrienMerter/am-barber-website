/* ==================== GESTION DU MENU MOBILE (Version Finale Corrigée) ==================== */
document.addEventListener('DOMContentLoaded', function() {

    const navMenu = document.getElementById('nav-menu');
    const navToggle = document.getElementById('nav-toggle');
    const navClose = document.getElementById('nav-close');
    const menuOverlay = document.getElementById('menu-overlay');
    const header = document.getElementById('header'); // On récupère le header

    if (!navMenu || !navToggle || !navClose || !menuOverlay || !header) {
        console.error("Erreur Critique : Un ou plusieurs éléments du menu sont introuvables.");
        return;
    }

    const openMenu = () => {
        navMenu.classList.add('show-menu');
        menuOverlay.classList.add('show-overlay');
        header.classList.add('menu-open'); // AJOUTÉ : Pour gérer le z-index
    };

    const closeMenu = () => {
        navMenu.classList.remove('show-menu');
        menuOverlay.classList.remove('show-overlay');
        header.classList.remove('menu-open'); // AJOUTÉ : Pour gérer le z-index
    };

    navToggle.addEventListener('click', openMenu);
    navClose.addEventListener('click', closeMenu);
    menuOverlay.addEventListener('click', closeMenu);

    const navLinks = document.querySelectorAll('.nav__link');
    navLinks.forEach(link => {
        link.addEventListener('click', closeMenu);
    });
});

