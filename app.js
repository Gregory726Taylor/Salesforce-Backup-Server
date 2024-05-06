const express = require('express');
const mysql = require('mysql2/promise');
const path = require("path");
const dotenv = require('dotenv');
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const hbs = require('hbs');
//const { main } = require('./export');
const cookieParser = require('cookie-parser');
const { fork } = require('child_process');
const cronJobsRouter = require('./Githubpush/Salesforce-Backup-Server/API/cron-API');
const backupRoutes = require('./Githubpush/Salesforce-Backup-Server/API/backup-API');
const { getMainDB } = require('./database'); // Assuming you have a db module for
let db;

const app = express();

let user;
// Initialize database connection



app.use(express.json());
app.use(cookieParser());

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, './public')));
app.use('/api/cron-jobs', cronJobsRouter);
app.use('/backup', backupRoutes);
app.set('view engine', 'hbs');
hbs.registerPartials(path.join(__dirname, 'views', 'partials'));






// Middleware to parse JWT and set user info
app.use((req, res, next) => {
    if (req.cookies.jwt) {
        jwt.verify(req.cookies.jwt, process.env.JWT_SECRET, (err, decoded) => {
            if (!err) {
                req.user = decoded;
            } else {
                console.error('JWT Error:', err);
            }
        });
    }
    next();
});
app.get("/auth2/callback", (req, res) => {
    res.render("start-export", { user: req.user});

});
function checkAuthentication(req, res, next) {
    if (!req.user) {
        res.redirect('/login');
    } else {
        next( );
    }
}

function checkAdmin(req, res, next) {
    if (req.user && req.user.isAdmin) {
        console.log("User is an admin");
        next();
    } else {
        res.status(403).send("Access denied. Admins only.");
    }
}

app.get("/", (req, res) => {
    res.render("index", { user: req.user });
});

app.get("/register", checkAuthentication, checkAdmin, (req, res) => {
    res.render("register", { user: req.user, isAdmin: req.user.isAdmin });
});

app.get("/login", (req, res) => {
    res.render("login");
});

app.get("/logout", (req, res) => {
    res.clearCookie('jwt');
    res.redirect("/login");
});

app.post("/auth/register", checkAuthentication, checkAdmin, async (req, res) => {
    const { name, email, password, password_confirm } = req.body;

    if (password !== password_confirm) {
        return res.render('register', {
            message: 'Passwords do not match!'
        });
    }

    try {
        const [rows] = await db.query('SELECT email FROM users WHERE email = ?', [email]);
        if (rows.length > 0) {
            return res.render('register', {
                message: 'This email is already in use'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 8);
        await db.query('INSERT INTO users SET ?', { name, email, password: hashedPassword });
        res.render('register', {
            message: 'User registered!'
        });
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).render('register', {
            message: 'Error registering new user'
        });
    }
});

app.post("/auth/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const [results] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (results.length === 0 || !(await bcrypt.compare(password, results[0].password))) {
            return res.render('login', {
                message: 'Email or Password is incorrect'
            });
        }

        const user = results[0];
        console.log('User logged in:', user);
        const token = jwt.sign({ id: user.id, isAdmin: user.isAdmin }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN
        });

        const cookieOptions = {
            expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        };

        res.cookie('jwt', token, cookieOptions);
        res.redirect("/start-export");
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).send('Login failed');
    }
});


async function startApp() {
    app.listen(5000, () => {
        console.log("Server started on port 5000");
    });
    db = await getMainDB();
    // Fetch and upsert Salesforce objects on startup
    try {
        const allObjectsDebug = false;
        
        if (allObjectsDebug === true){
            const allObjects = await getAllSalesforceObjects();
            await upsertSalesforceObjects(allObjects);
        }

    } catch (error) {
        console.error("Error fetching and upserting Salesforce objects:", error);
    }

    // Start the cron-schedule.js script
    const cronScheduler = fork('./cron-schedule.js');
}

startApp();
module.exports = app;

