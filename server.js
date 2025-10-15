// server.js (Backend)

// Chargement des variables d'environnement depuis le fichier .env
// Assurez-vous que votre fichier .env à la racine du projet contient :
// PORT=3000
// GOOGLE_CLIENT_EMAIL=votre-email@domaine.com.gserviceaccount.com
// GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
// CALENDAR_ID=votre-calendar-id@group.calendar.google.com
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');

const app = express();

// --- Configuration du Port ---
// Utilise le port défini dans .env ou le port 3000 par défaut.
const PORT = process.env.PORT || 3000;

// --- Configuration CORS ---
// Liste des origines autorisées pour les requêtes cross-origin.
// Adaptez cette liste avec les origines exactes de votre frontend en développement et en production.
const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://odrienmerter.github.io', 
];

const corsOptions = {
  origin: (origin, callback) => {
    // Permet les requêtes sans origine (ex: outils en ligne de commande)
    if (!origin) {
        console.log('CORS: Requête sans origine autorisée.');
        return callback(null, true);
    }
    // Vérifie si l'origine de la requête est dans la liste des origines autorisées
    if (allowedOrigins.includes(origin)) {
      console.log(`CORS: Origine autorisée: ${origin}`);
      callback(null, true); // Autorise la requête
    } else {
      // Log détaillé en cas de blocage CORS pour faciliter le débogage
      console.warn(`CORS blocked: Origin ${origin} not allowed. Allowed origins are: ${allowedOrigins.join(', ')}`);
      callback(new Error(`Origin ${origin} not allowed by CORS policy.`), false); // Bloque la requête
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // Méthodes HTTP autorisées
  credentials: true, // Permet d'envoyer des cookies, tokens, etc.
  optionsSuccessStatus: 204 // Statut pour les requêtes OPTIONS réussies
};

app.use(cors(corsOptions));

// Middleware pour parser le corps des requêtes JSON et URL-encoded
// Limité à 1mb pour des raisons de sécurité et de performance.
app.use(express.json({ limit: '1mb' })); 
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// --- Vérification des variables d'environnement critiques ---
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
const CALENDAR_ID = process.env.CALENDAR_ID;

// Vérifie la présence des informations nécessaires pour Google Calendar
if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !CALENDAR_ID) {
    const errorMsg = "Erreur critique: Variables d'environnement Google (GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, CALENDAR_ID) non configurées correctement dans le fichier .env !";
    console.error(`\x1b[31m${errorMsg}\x1b[0m`); // Affiche le message d'erreur en rouge
    // Note: Le script continuera, mais l'initialisation de Google Calendar échouera.
    // En production, vous pourriez vouloir arrêter le serveur ici : process.exit(1);
} else {
    console.log('✅ Configuration Google Calendar chargée avec succès.');
}

// --- Configuration et Initialisation de Google Calendar ---
let calendarClient; // Variable globale pour stocker le client Google Calendar

/**
 * Initialise le client Google Calendar en utilisant les credentials du compte de service.
 * Retourne true si l'initialisation réussit, false sinon.
 */
async function initializeGoogleCalendar() {
    // Vérifie la présence des informations nécessaires avant de tenter l'initialisation
    if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !CALENDAR_ID) {
        console.error("Impossible d'initialiser Google Calendar: Credentials ou CALENDAR_ID manquants dans .env.");
        return false; // Échec de l'initialisation
    }

    try {
        // Crée l'objet d'authentification Google
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: GOOGLE_CLIENT_EMAIL,
                private_key: GOOGLE_PRIVATE_KEY,
            },
            scopes: ['https://www.googleapis.com/auth/calendar'], // Scope pour l'accès complet au calendrier
        });

        const authClient = await auth.getClient(); // Obtient un client authentifié
        calendarClient = google.calendar({ version: 'v3', auth: authClient }); // Instancie le client Google Calendar
        console.log('✅ Client Google Calendar initialisé avec succès.');
        return true; // Succès de l'initialisation
    } catch (error) {
        console.error("❌ Erreur lors de l'initialisation de Google Calendar:", error.message);
        // Log les détails de l'erreur si disponibles (utile pour le débogage)
        if (error.response && error.response.data) {
            console.error("Détails de l'erreur Google API:", error.response.data);
        }
        calendarClient = null; // Assure que calendarClient est null en cas d'échec
        return false; // Échec de l'initialisation
    }
}

// --- Middleware de vérification du client Google Calendar ---
// Ce middleware s'assure que le client Google Calendar est prêt avant de traiter les routes API.
const ensureCalendarInitialized = (req, res, next) => {
    console.log("[DEBUG MIDDLEWARE] Vérification de l'initialisation de Google Calendar...");
    // Si le client n'est pas initialisé, renvoie une erreur 503 Service Unavailable
    if (!calendarClient) {
        console.error(`[DEBUG MIDDLEWARE] Client Google Calendar non initialisé. Requête bloquée pour ${req.method} ${req.originalUrl}`);
        return res.status(503).json({ error: "Service Google Calendar indisponible. Veuillez réessayer plus tard." });
    }
    // Attache le client Calendar à l'objet `req` pour un accès facile dans les contrôleurs de route.
    req.calendar = calendarClient; 
    console.log("[DEBUG MIDDLEWARE] Client Google Calendar prêt. Attachement à req.calendar.");
    next(); // Passe au prochain middleware ou à la route si le client est prêt
};

// --- Routes de l'API ---

// Route de base pour vérifier si le serveur est actif
app.get('/', (req, res) => {
    console.log("[DEBUG ROUTAGE] Appel à la route '/'");
    res.status(200).json({ message: 'Serveur backend de réservation en ligne actif !' });
});

// Endpoint pour vérifier la disponibilité d'un créneau horaire
// Nécessite que le client Google Calendar soit initialisé (via le middleware)
app.post('/api/check-availability', ensureCalendarInitialized, async (req, res) => {
    console.log("[DEBUG ROUTAGE] Appel à la route '/api/check-availability'");
    const { startDateTimeISO } = req.body;
    const CALENDAR_ID = process.env.CALENDAR_ID; 
    console.log(`[POST /api/check-availability] Reçu:`, { startDateTimeISO });

    // Vérifications des paramètres requis
    if (!CALENDAR_ID) {
        console.error("[POST /api/check-availability] Erreur: CALENDAR_ID non configuré.");
        return res.status(500).json({ error: "Configuration du calendrier invalide côté serveur." });
    }
    if (!startDateTimeISO) {
        console.error('[POST /api/check-availability] Erreur: startDateTimeISO manquant dans la requête.');
        return res.status(400).json({ error: "Date et heure de début manquantes pour la vérification." });
    }

    try {
        // Calculer la fin du créneau pour la recherche (30 minutes après le début)
        const startTime = new Date(startDateTimeISO);
        const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); 
        const timeMaxISO = endTime.toISOString();

        console.log(`[POST /api/check-availability] Recherche d'événements entre ${startDateTimeISO} et ${timeMaxISO}`);

        // Utilise le client Google Calendar attaché à `req` pour lister les événements
        const response = await req.calendar.events.list({
            calendarId: CALENDAR_ID,
            timeMin: startDateTimeISO,
            timeMax: timeMaxISO,
            maxResults: 1, // Optimisation : on cherche juste s'il y a au moins un événement
            singleEvents: true, // Déroule les événements récurrents pour trouver les occurrences
            orderBy: 'startTime', 
        });

        // Détermine la disponibilité : true si aucun événement trouvé dans la plage, false sinon
        const isAvailable = !(response.data.items && response.data.items.length > 0);

        console.log(`[POST /api/check-availability] Résultat: Disponible = ${isAvailable}`);
        res.json({ available: isAvailable }); // Renvoie le statut de disponibilité

    } catch (error) {
        console.error("[POST /api/check-availability] Erreur lors de la vérification de disponibilité:", error.message);
        if (error.response && error.response.data) {
            console.error("[POST /api/check-availability] Détails de l'erreur Google API:", error.response.data);
        }
        // Renvoie une erreur serveur générique
        res.status(500).json({ error: "Erreur serveur lors de la vérification de disponibilité." });
    }
});

// Endpoint pour créer une réservation
// Nécessite que le client Google Calendar soit initialisé (via le middleware)
app.post('/api/create-booking', ensureCalendarInitialized, async (req, res) => {
    console.log("[DEBUG ROUTAGE] Appel à la route '/api/create-booking'");
    const { summary, startDateTimeISO, endDateTimeISO, description, email } = req.body;
    const CALENDAR_ID = process.env.CALENDAR_ID; 
    console.log('[POST /api/create-booking] Reçu:', { summary, startDateTimeISO, endDateTimeISO, email });

    // Validation des données requises pour créer une réservation
    if (!summary || !startDateTimeISO || !endDateTimeISO) {
        console.error('[POST /api/create-booking] Erreur: Données requises manquantes (summary, startDateTimeISO, endDateTimeISO).');
        return res.status(400).json({ error: "Les informations de résumé, date/heure de début et de fin sont requises." });
    }

    if (!CALENDAR_ID) {
        console.error("[POST /api/create-booking] Erreur: CALENDAR_ID non configuré.");
        return res.status(500).json({ error: "Configuration du calendrier invalide côté serveur." });
    }

    // Structure de l'événement à insérer dans Google Calendar
    const event = {
        summary: summary,
        // Définition des horaires de début et de fin, avec le fuseau horaire
        start: {
            dateTime: startDateTimeISO,
            timeZone: 'Europe/Paris', // Adaptez ce fuseau horaire si nécessaire
        },
        end: {
            dateTime: endDateTimeISO,
            timeZone: 'Europe/Paris', // Adaptez ce fuseau horaire si nécessaire
        },
        description: description, // Ajout de la description fournie par l'utilisateur
        
        // ATTENTION : Google Calendar API interdit aux comptes de service d'inviter des participants
        // sans la délégation Domain-Wide Authority. Pour éviter une erreur 403, nous commentons cette partie.
        // Si vous avez besoin d'inviter des clients, vous devrez configurer la délégation Domain-Wide.
        // attendees: email ? [{ email: email, responseStatus: 'accepted' }] : [],
        
        // Configuration des rappels pour l'événement
        reminders: {
            useDefault: false, // Désactive les rappels par défaut de Google Calendar
            overrides: [
                // Ajoute des rappels personnalisés
                { method: 'email', minutes: 24 * 60 }, // Rappel 1 jour avant par email
                { method: 'popup', minutes: 10 },      // Rappel 10 minutes avant par popup
            ],
        },
    };

    try {
        console.log(`[POST /api/create-booking] Tentative de création d'événement dans le calendrier : ${CALENDAR_ID}`);
        // Utilise le client Google Calendar attaché à `req` pour insérer l'événement
        const response = await req.calendar.events.insert({
            calendarId: CALENDAR_ID,
            resource: event,
            sendNotifications: true, // Envoie des notifications par email aux participants (si vous les aviez ajoutés)
        });
        console.log(`[POST /api/create-booking] Événement créé avec succès. Lien : ${response.data.htmlLink}`);
        // Retourne un succès, le lien vers l'événement créé et son ID
        res.json({ success: true, eventLink: response.data.htmlLink, eventId: response.data.id });
    } catch (error) {
        console.error("[POST /api/create-booking] Erreur lors de la création de l'événement:", error.message);
        if (error.response && error.response.data) {
            console.error("[POST /api/create-booking] Détails de l'erreur Google API:", error.response.data);
            // Gestion spécifique pour le cas où le créneau est déjà occupé (code 409)
            if (error.response.data.error && error.response.data.error.code === 409) {
                 return res.status(409).json({ error: "Ce créneau horaire est déjà occupé. Veuillez choisir un autre créneau." });
            }
        }
        // Renvoie une erreur serveur générique si le problème n'est pas spécifiquement identifié
        res.status(500).json({ error: "Erreur serveur lors de la création de la réservation." });
    }
});


// --- Lancement du Serveur ---
// Fonction principale asynchrone pour orchestrer l'initialisation et le démarrage du serveur
async function startServer() {
    // Tente d'initialiser le client Google Calendar avant de démarrer le serveur
    const initSuccess = await initializeGoogleCalendar(); 

    // Affiche un message d'état basé sur le succès de l'initialisation
    if (!initSuccess) {
        // Avertissement si l'initialisation Google Calendar a échoué
        console.warn("\x1b[33m⚠️ Le client Google Calendar n'a pas pu être initialisé. Les opérations de calendrier échoueront.\x1b[0m");
    } else {
        console.log('✅ Client Google Calendar est prêt.'); // Confirmation que le client est prêt
    }

    // Démarre le serveur Express pour écouter les requêtes entrantes
    const server = app.listen(PORT, () => {
        console.log(`\n🚀 Serveur backend démarré avec succès sur le port ${PORT}`);
        console.log(`✅ CORS configuré pour autoriser : ${allowedOrigins.join(', ')}`);
    });

    // --- Gestion des Erreurs et Arrêt Propre ---

    // Gestionnaire pour SIGINT (Ctrl+C) pour un arrêt propre du serveur
    process.on('SIGINT', () => {
        console.log('\n🔌 Arrêt du serveur...');
        server.close(() => {
            console.log('✅ Serveur arrêté proprement.');
            process.exit(0); // Quitte le processus avec un code de succès
        });
    });

    // Gestionnaire pour les erreurs non interceptées qui pourraient faire planter le processus
    process.on('uncaughtException', (err) => {
        console.error('\x1b[31m❌ Erreur critique non interceptée:\x1b[0m', err);
        // Tente d'arrêter le serveur proprement avant de quitter
        server.close(() => {
            console.error('Serveur arrêté suite à une erreur critique.');
            process.exit(1); // Quitte le processus avec un code d'erreur
        });
    });

    // Gestionnaire pour les promesses rejetées non attrapées (unhandledRejection)
    process.on('unhandledRejection',     (reason, promise) => {
        console.error('\x1b[31m❌ Rejet de promesse non géré:\x1b[0m', reason);
        // Il peut être judicieux de fermer le serveur ici aussi si le rejet est critique
        // server.close(() => process.exit(1));
    });
}

// Appel de la fonction principale pour démarrer l'application
startServer();