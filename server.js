require('dotenv').config();
const express = require('express');

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const cookieParser = require('cookie-parser');

const app = express();
const port = process.env.PORT || 3001;

// Persistent state (DB, WhatsApp auth, JWT secret) lives under DATA_DIR so it can
// be mounted on a single volume in production. Defaults to the app dir for local dev.
const DATA_DIR = process.env.DATA_DIR || __dirname;

// Initialize SQLite Database Connection
const db = new sqlite3.Database(path.resolve(DATA_DIR, 'database.sqlite'), sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'myassets')));

// View Engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Make db available to routes
app.use((req, res, next) => {
    req.db = db;
    next();
});

// Routes
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

const paymentRoutes = require('./routes/payment');
app.use('/payment4', paymentRoutes);

const authRoutes = require('./routes/auth');
app.use('/', authRoutes);

const dashboardRoutes = require('./routes/dashboard');
app.use('/dashboard', dashboardRoutes);

const vazhipaduRoutes = require('./routes/vazhipadu');
app.use('/dashboard/vazhipadu', vazhipaduRoutes);

const specialDaysRoutes = require('./routes/specialdays');
app.use('/dashboard/specialdays', specialDaysRoutes);

const nakshathraPoojaRoutes = require('./routes/nakshathrapooja');
app.use('/dashboard/nakshathrapooja', nakshathraPoojaRoutes);

const whatsappRoutes = require('./routes/whatsapp');
app.use('/dashboard/whatsapp', whatsappRoutes);

// Redirect Home Route to Dashboard
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

const { initWhatsAppBot } = require('./whatsappBot');

app.listen(port, () => {
    console.log(`Temple UPI Gateway Node.js Server listening at http://localhost:${port}`);
    initWhatsAppBot(db);
});
