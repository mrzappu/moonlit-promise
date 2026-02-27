#!/usr/bin/env node
// scripts/restore.js - Restore from backup
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const backupsDir = path.join(__dirname, '..', 'backups');
const dbPath = path.join(__dirname, '..', 'Imposter.db');

// Check if backups directory exists
if (!fs.existsSync(backupsDir)) {
    console.error('❌ Backups directory not found!');
    process.exit(1);
}

// Get all backup files
const backups = fs.readdirSync(backupsDir)
    .filter(f => f.endsWith('.db'))
    .sort((a, b) => {
        return fs.statSync(path.join(backupsDir, b)).mtime - 
               fs.statSync(path.join(backupsDir, a)).mtime;
    });

if (backups.length === 0) {
    console.error('❌ No backup files found!');
    process.exit(1);
}

console.log('\n' + '='.repeat(60));
console.log('📋 AVAILABLE BACKUPS');
console.log('='.repeat(60) + '\n');

backups.forEach((b, i) => {
    const stats = fs.statSync(path.join(backupsDir, b));
    const date = stats.mtime.toLocaleString();
    console.log(`${(i + 1).toString().padStart(2)}. ${b}`);
    console.log(`   📊 ${(stats.size / 1024 / 1024).toFixed(2)} MB • 📅 ${date}\n`);
});

rl.question('\n📝 Enter backup number to restore (or q to quit): ', (input) => {
    if (input.toLowerCase() === 'q') {
        console.log('❌ Restore cancelled.');
        rl.close();
        return;
    }

    const index = parseInt(input) - 1;
    if (index >= 0 && index < backups.length) {
        const backupFile = backups[index];
        const backupPath = path.join(backupsDir, backupFile);
        
        console.log(`\n⚠️  WARNING: This will replace your current database!`);
        rl.question('Type "RESTORE" to confirm: ', (confirm) => {
            if (confirm === 'RESTORE') {
                try {
                    // Create backup of current DB
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const currentBackup = `pre-restore-${timestamp}.db`;
                    const currentBackupPath = path.join(backupsDir, currentBackup);
                    
                    if (fs.existsSync(dbPath)) {
                        fs.copyFileSync(dbPath, currentBackupPath);
                        console.log(`💾 Current database backed up as: ${currentBackup}`);
                    }
                    
                    // Restore selected backup
                    fs.copyFileSync(backupPath, dbPath);
                    
                    console.log('\n' + '✅'.repeat(50));
                    console.log('✅           RESTORE SUCCESSFUL           ✅');
                    console.log('✅'.repeat(50));
                    console.log(`\n📁 Restored: ${backupFile}`);
                    console.log(`💾 Backup saved: ${currentBackup}`);
                    console.log(`📅 Time: ${new Date().toLocaleString()}\n`);
                    
                } catch (error) {
                    console.error('❌ Restore failed:', error.message);
                }
            } else {
                console.log('❌ Restore cancelled.');
            }
            rl.close();
        });
    } else {
        console.log('❌ Invalid selection.');
        rl.close();
    }
});
