const express = require('express');
const router = express.Router();
const { getMainDB } = require('../../../database');
let db;

async function startDatabase() {
    db = await getMainDB();
}

startDatabase();

router.get('/', async (req, res) => {
    const { objectName, fromDate, toDate } = req.query;

    let query = 'SELECT ObjectName, BackupDate, FilePath FROM Backups WHERE 1=1';
    const params = [];

    if (objectName) {
        query += ' AND ObjectName LIKE ?';
        params.push(`%${objectName}%`);
    }
    if (fromDate) {
        query += ' AND BackupDate >= ?';
        params.push(fromDate);
    }
    if (toDate) {
        query += ' AND BackupDate <= ?';
        params.push(toDate);
    }

    try {
        const [backups] = await db.query(query, params);

        // Group backups by ObjectName
        const groupedBackups = backups.reduce((groups, backup) => {
            if (!groups[backup.ObjectName]) {
                groups[backup.ObjectName] = [];
            }
            groups[backup.ObjectName].push(backup);
            return groups;
        }, {});

        res.render('backup', { groupedBackups });
    } catch (error) {
        console.error('Error fetching backups:', error);
        res.status(500).send('Error fetching backups');
    }
});

module.exports = router;
