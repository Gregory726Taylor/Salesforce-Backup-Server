const jsforce = require('jsforce');
const sfbulk = require('node-sf-bulk2');
const cron = require('node-cron');
const cronParser = require('cron-parser');
const fs = require('fs');
const fsPromises = fs.promises;
const archiver = require('archiver');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');  // Include the path module
dotenv.config({ path: './.env' });
const { getMainDB } = require('./database'); // Assuming you have a db module for
 let conn, db;

async function initializeSalesforceConnection() {
    conn = new jsforce.Connection({
        loginUrl: process.env.SF_URL,
        version: '58.0',
        instanceUrl: process.env.SF_URL,
        sessionId: process.env.SF_SESSION_ID
    });
}

async function setupBulk2Connection() {
    const bulkconnect = {
        accessToken: conn.accessToken,
        apiVersion: '58.0',
        instanceUrl: conn.instanceUrl
    };
    return new sfbulk.BulkAPI2(bulkconnect);
}
async function getAllSalesforceObjects() {
    try {
        const result = await conn.describeGlobal();
        console.log("Fetched all Salesforce objects.");
        return result.sobjects.map(sobject => ({
            name: sobject.name,
            label: sobject.label
        }));
    } catch (error) {
        console.error("Error fetching Salesforce objects:", error);
        throw error;
    }
}
async function getObjectFields(sobjectName) {
    const metadata = await conn.describe(sobjectName);
    return metadata.fields.map(field => field.name).join(',');
}

let scheduledJobs = {};

async function loadCronJobs() {
    const [rows] = await db.query(`SELECT Id, ObjectName, CronExpression FROM CronJobs`);

    for (let job of rows) {

        console.log(`Loading cron job: ${job.CronExpression} for ${job.ObjectName}`);
        // Schedule the job
        scheduledJobs[job.Id] = cron.schedule(job.CronExpression, async () => {
            const currentTime = new Date();
            const nextTime = cronParser.parseExpression(job.CronExpression, { currentDate: currentTime }).next().toDate();
            
            console.log(`Job started at ${currentTime.toLocaleTimeString()}. Next run time is ${nextTime.toLocaleTimeString()}.`);
            
            // Update database with last run and next run times
            await db.query(`UPDATE CronJobs SET LastRunTime = ?, NextRunTime = ? WHERE Id = ?`, [currentTime, nextTime, job.Id]);
            
            console.log(`Backup for ${job.ObjectName} will be started. Next run at ${nextTime.toLocaleTimeString()}.`);

            // Call the backup function here
            await runBackup(job.ObjectName);
        });
    }
}

const tempPath = path.join(__dirname, 'private', 'temp');
const backupBasePath = path.join(__dirname, 'private', 'DatabaseBackup');

async function runBackup(sobject) {
    console.log(`Scheduled backup for ${sobject}`);
    const bulk2 = await setupBulk2Connection();

    const fields = await getObjectFields(sobject);
    const query = `SELECT ${fields} FROM ${sobject} LIMIT 10`;
    console.log(`Running query: ${query}`);

    try {
        let response = await bulk2.submitBulkQueryJob({ query, operation: 'query' });
        while (response.state !== 'JobComplete') {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds before checking again
            response = await bulk2.getBulkQueryJobInfo(response.id);
        }

        const result = await bulk2.getBulkQueryResults(response.id);
        if (!fs.existsSync(tempPath)) {
            fs.mkdirSync(tempPath, { recursive: true });
        }

        const objectBackupPath = path.join(backupBasePath, sobject); // Object-specific subdirectory
        if (!fs.existsSync(objectBackupPath)) {
            fs.mkdirSync(objectBackupPath, { recursive: true });
        }

        const csvFilePath = path.join(tempPath, `results_${sobject}_${response.id}.csv`);
        await fs.promises.writeFile(csvFilePath, result.data);

        // Zip the CSV file
        const zipFilePath = await zipFile(csvFilePath);
        const relativeZipPath = path.join(sobject, path.basename(zipFilePath)); // Relative path to be saved
        fs.renameSync(zipFilePath, path.join(backupBasePath, relativeZipPath));

        // Insert the relative path into the database
        await db.query(`INSERT INTO Backups (ObjectName, BackupDate, FilePath) VALUES (?, NOW(), ?)`, [sobject, relativeZipPath]);

        console.log(`Backup complete for ${sobject}. File located at: ${path.join(backupBasePath, relativeZipPath)}`);

        // Clean up the temp directory
        fs.unlinkSync(csvFilePath); // Deletes the temporary CSV file
    } catch (error) {
        console.error(`Error in running backup for ${sobject}:`, error);
    }
}

async function zipFile(sourceFilePath) {
    const zipFilePath = `${sourceFilePath.replace(/\.csv$/, '.zip')}`;
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', err => { throw err; });
    archive.pipe(output);
    archive.append(fs.createReadStream(sourceFilePath), { name: path.basename(sourceFilePath) });
    await archive.finalize();

    return zipFilePath;
}




async function main() {
    db = await getMainDB();
    await initializeSalesforceConnection();



}

if (require.main === module) {
    main().then(() => console.log("Scheduler started successfully.")).catch(err => {
        console.error(err);
    });
}

module.exports = { main ,runBackup, getObjectFields};
