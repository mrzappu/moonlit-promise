#!/usr/bin/env node
// scripts/backup.js - Manual backup script
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Create backups directory if not exists
const backupsDir = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupName = `manual-backup-${timestamp}.db`;
const backupPath = path.join(backupsDir, backupName);
const dbPath = path.join(__dirname, '..', 'Imposter.db');

// Check if database exists
if (!fs.existsSync(dbPath)) {
    console.error('❌ Database file not found!');
    process.exit(1);
}

// Copy database
try {
    fs.copyFileSync(dbPath, backupPath);
    const stats = fs.statSync(backupPath);
    console.log('✅'.repeat(50));
    console.log('✅           BACKUP SUCCESSFUL           ✅');
    console.log('✅'.repeat(50));
    console.log(`\n📁 Backup: ${backupName}`);
    console.log(`📊 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📅 Time: ${new Date().toLocaleString()}`);
    console.log(`📍 Location: ${backupPath}\n`);

    // Optional: Push to GitHub
    if (process.argv.includes('--push')) {
        console.log('📤 Pushing to GitHub...');
        execSync('git add backups/');
        execSync(`git commit -m "Manual backup ${timestamp}"`);
        execSync('git push');
        console.log('✅ Pushed to GitHub successfully!');
    }
} catch (error) {
    console.error('❌ Backup failed:', error.message);
    process.exit(1);
}
