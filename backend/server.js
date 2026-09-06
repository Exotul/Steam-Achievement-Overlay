const { ladeKonfiguration } = require('./services/config');
ladeKonfiguration(__dirname);
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const cors = require('cors');

const configurePassport = require('./config/passport');
const FileSessionStore = require('./services/fileSessionStore');
const logger = require('./services/logger');
logger.setBereich('backend');
const authRoutes = require('./routes/auth');
const steamRoutes = require('./routes/steam');

// Beim Start einmal pruefen, ob der Schluessel ueberhaupt brauchbar ist -
// sonst scheitert erst die Anmeldung mit einem nichtssagenden 403.
const steamApiCheck = require('./services/steamApi');
steamApiCheck
  .checkApiKey()
  .then((ergebnis) => {
    if (ergebnis.ok) {
      logger.info('Steam-API-Schlüssel geprüft: in Ordnung.');
    } else {
      logger.warn('Steam-API-Schlüssel PROBLEM: ' + ergebnis.grund);
    }
  })
  .catch(() => {});

configurePassport();

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);

app.use(
  session({
    // Dauerhafter Speicher statt Arbeitsspeicher: Die Overlay-App startet das
    // Backend bei jedem Programmstart neu. Ohne diesen Speicher waere die
    // Anmeldung danach jedes Mal weg.
    store: new FileSessionStore(),
    secret: process.env.SESSION_SECRET || 'dev-secret-bitte-aendern',
    resave: false,
    saveUninitialized: false,
    rolling: true, // bei jedem Zugriff verlaengern, damit aktive Nutzung nicht ablaeuft
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 90, // 90 Tage
      // secure: true, // aktivieren, sobald über HTTPS ausgeliefert wird
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Health-Check bleibt bewusst vor dem Auth-Router und ohne Login-Zwang -
// die Overlay-App nutzt ihn, um zu prüfen, ob das (ggf. selbst gestartete)
// Backend schon bereit ist, unabhängig vom Login-Status.
const steamHealth = require('./services/steamHealth');

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    loggedIn: !!(req.isAuthenticated && req.isAuthenticated()),
    steam: steamHealth.status(),
  });
});

// Schlüsselprüfung - bewusst ohne Anmeldezwang, denn sie wird genau dann
// gebraucht, wenn die Anmeldung nicht klappt. Der Schlüssel selbst wird
// nicht ausgegeben.
app.get('/api/keycheck', async (req, res) => {
  try {
    const ergebnis = await steamApiCheck.checkApiKey();
    res.json(ergebnis);
  } catch (err) {
    res.status(500).json({ ok: false, grund: err.message });
  }
});

app.use('/auth', authRoutes);
app.use('/api', steamRoutes);

// Falls das Dashboard gebaut wurde (npm run build im frontend-Ordner),
// wird es direkt hier mit ausgeliefert - dann reicht eine einzige Adresse
// (http://localhost:3000) für alles, ganz ohne separaten Frontend-Server
// und ganz ohne CORS-Ärger, weil alles same-origin läuft.
const distCandidates = [
  path.join(__dirname, '..', 'frontend', 'dist'), // Projekt im Entwicklungs-Layout
  path.join(process.resourcesPath || '', 'frontend-dist'), // gepackte Overlay-App
];
const distPath = distCandidates.find((p) => p && fs.existsSync(p));

if (distPath) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/auth')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
  console.log(`Dashboard wird mit ausgeliefert aus: ${distPath}`);
} else {
  app.get('/', (req, res) => {
    res.json({
      status: 'ok',
      loggedIn: !!(req.isAuthenticated && req.isAuthenticated()),
      hint: 'Kein gebautes Dashboard gefunden - im frontend-Ordner "npm run build" ausführen.',
    });
  });
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  logger.info(`Backend läuft auf http://localhost:${port}`);
});
