const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

let mainDB;

async function initializeDatabases(debugCallback) {
    try {
        mainDB = await mysql.createConnection({
            host: process.env.DATABASE_HOST,
            user: process.env.DATABASE_USER,
            password: process.env.DATABASE_PASSWORD,
            database: process.env.DATABASE
        });

        if (debugCallback) {
            debugCallback(null, "MySQL connected successfully!");
        }

        return mainDB; // Return the database connection
    } catch (error) {
        if (debugCallback) {
            debugCallback(error);
        } else {
            console.error("Failed to connect to MySQL:", error);
            process.exit(1);
        }
    }
}

// Export a function that returns the mainDB connection after initialization
async function getMainDB() {
    if (!mainDB) {
        await initializeDatabases();
    }
    return mainDB;
}

module.exports = { initializeDatabases, getMainDB };
