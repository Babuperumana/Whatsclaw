const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Resolve a JWT secret.
// Priority:
//   1. process.env.JWT_SECRET (recommended for production — set it in .env)
//   2. A locally-persisted random secret (.jwt_secret) so it survives restarts
//      instead of falling back to a well-known hardcoded string.
function resolveSecret() {
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim() !== '') {
        return process.env.JWT_SECRET;
    }

    // Persist under DATA_DIR (mounted volume in production) so the secret — and
    // therefore existing login sessions — survive restarts and redeploys.
    const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '..');
    const secretPath = path.resolve(dataDir, '.jwt_secret');
    try {
        if (fs.existsSync(secretPath)) {
            const existing = fs.readFileSync(secretPath, 'utf8').trim();
            if (existing) return existing;
        }
        const generated = crypto.randomBytes(48).toString('hex');
        fs.writeFileSync(secretPath, generated, { mode: 0o600 });
        console.warn('[auth] JWT_SECRET not set. Generated a persistent secret at .jwt_secret. ' +
            'For production, set JWT_SECRET in your .env instead.');
        return generated;
    } catch (err) {
        // As a last resort (e.g. read-only FS), keep the server running with an
        // in-memory secret. Tokens will invalidate on restart.
        console.warn('[auth] Could not persist JWT secret (' + err.message + '). Using an in-memory secret.');
        return crypto.randomBytes(48).toString('hex');
    }
}

const JWT_SECRET = resolveSecret();

function requireAuth(req, res, next) {
    const token = req.cookies.jwt_token;

    if (!token) {
        return res.redirect('/login');
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.clearCookie('jwt_token');
        return res.redirect('/login');
    }
}

function redirectIfAuthenticated(req, res, next) {
    const token = req.cookies.jwt_token;

    if (token) {
        try {
            jwt.verify(token, JWT_SECRET);
            return res.redirect('/dashboard');
        } catch (err) {
            // Token is invalid, let them proceed to login
        }
    }
    next();
}

module.exports = {
    requireAuth,
    redirectIfAuthenticated,
    JWT_SECRET
};
