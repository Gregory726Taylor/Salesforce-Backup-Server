const express = require('express');
const router = express.Router();
const dotenv = require('dotenv');
dotenv.config({ path: './.env' });
const cronParser = require('cron-parser');
const { getMainDB } = require('../../../database');

const { checkAuthentication, checkAdmin } = require('../../../middleware');
let db;

async function startDatabase() {
db = await getMainDB();
}

startDatabase();
// Fetch all cron jobs
router.get('/', async (req, res) => {
    try {
        const [results] = await db.query('SELECT * FROM CronJobs');
        results.forEach(job => {
            const nextDate = cronParser.parseExpression(job.CronExpression).next().toDate();
            job.NextRunTime = nextDate; // Calculate next run time on the fly
        });

        res.json(results);
    } catch (error) {
        console.error("Error fetching cron jobs:", error);
        res.status(500).json({ message: 'Error fetching cron jobs', error: error.message });
    }
});
// Add a new cron job
router.post('/', async (req, res) => {
    const { objectNames, cronExpression } = req.body;

    // 

    if (!objectNames || !cronExpression) {
        return res.status(400).send('Object names and cron expression are required');
    }

    try {
        const currentTime = new Date();
        const nextTime = cronParser.parseExpression(cronExpression, { currentDate: currentTime }).next().toDate();


        // Ensure cron expression is formatted correctly
        const query = 'INSERT INTO CronJobs (ObjectName, CronExpression,NextRunTime) VALUES ?';
        const values = objectNames.map(name => [name, cronExpression,nextTime]);
        const [results] = await db.query(query, [values]);
        res.status(201).json({ message: 'Cron job added successfully', id: results.insertId });
    } catch (error) {
        console.error("Error adding cron job:", error);
        res.status(500).json({ message: 'Error adding cron job', error: error.message });
    }
});


// Update an existing cron job
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { objectNames, cronExpression } = req.body;


    try {
        const formattedCronExpression = formatCronExpression(cronExpression);
        const updateQuery = 'UPDATE CronJobs SET ObjectName = ?, CronExpression = ? WHERE Id = ?';
        await db.query(updateQuery, [objectNames.join(','), cronExpression, id]);
        res.json({ message: 'Cron job updated successfully' });
    } catch (error) {
        console.error("Error updating cron job:", error);
        res.status(500).json({ message: 'Error updating cron job', error: error.message });
    }
});

// Delete a cron job
router.delete('/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const result = await db.query('DELETE FROM CronJobs WHERE Id = ?', [id]);
        if (result.affectedRows > 0) {
            res.send({ success: true, message: 'Cron job deleted successfully' });
        } else {
            res.status(404).send({ success: false, message: 'Cron job not found' });
        }
    } catch (error) {
        console.error("Failed to delete cron job:", error);
        res.status(500).send({ success: false, message: 'Error deleting cron job' });
    }
});

module.exports = router;
