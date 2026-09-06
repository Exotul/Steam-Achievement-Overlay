const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;

// Steam nutzt kein OAuth, sondern OpenID 2.0.
// Ergebnis nach erfolgreichem Login ist ein "profile"-Objekt mit der SteamID64
// und den öffentlichen Profildaten (Name, Avatar, ...).
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

function configurePassport() {
  passport.use(new SteamStrategy(
    {
      returnURL: `${process.env.BASE_URL}/auth/steam/return`,
      realm: process.env.BASE_URL,
      apiKey: process.env.STEAM_API_KEY,
    },
    (identifier, profile, done) => {
      // profile.id === SteamID64, profile._json enthält u.a. personaname, avatarfull
      const user = {
        steamId: profile.id,
        displayName: profile.displayName,
        avatar: profile._json.avatarfull,
        profileUrl: profile._json.profileurl,
      };
      return done(null, user);
    }
  ));
}

module.exports = configurePassport;
