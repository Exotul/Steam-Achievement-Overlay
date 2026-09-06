const express = require('express');
const passport = require('passport');

const router = express.Router();

// Startet den Steam-Login (leitet zu steamcommunity.com weiter)
router.get('/steam', passport.authenticate('steam'));

// Callback-URL, auf die Steam nach dem Login zurückleitet
router.get(
  '/steam/return',
  // Der Router haengt unter /auth - ohne das Praefix landete ein
  // fehlgeschlagener Login auf der Dashboard-Startseite (die Auffang-Route
  // liefert dort index.html mit Status 200) statt auf der Fehlermeldung.
  passport.authenticate('steam', { failureRedirect: '/auth/login-failed' }),
  (req, res) => {
    // Erfolgreich eingeloggt -> zurück zum Frontend
    res.redirect(process.env.FRONTEND_URL || '/');
  }
);

router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.redirect('/');
    });
  });
});

router.get('/me', (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: 'Nicht eingeloggt' });
  }
  res.json(req.user);
});

router.get('/login-failed', (req, res) => {
  res.status(401).json({ error: 'Steam-Login fehlgeschlagen' });
});

module.exports = router;
