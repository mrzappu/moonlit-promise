// github-backup.js - Automatic GitHub Database Backup Service
// This service automatically pushes imposter.db to your GitHub repo

const { Octokit } = require('@octokit/rest');
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const Logger = require('./logger');

class GitHubBackupService {
    constructor(config) {
        this.config = config;
        this.repoOwner = config.GITHUB_REPO_OWNER;
        this.repoName = config.GITHUB_REPO_NAME;
        this.branch = config.GITHUB_BRANCH || 'main';
        this.token = config.GITHUB_TOKEN;
        this.dbPath = path.join(__dirname, 'Imposter.db');
        this.backupPath = path.join(__dirname, 'Imposter.db');
        this.localRepoPath = __dirname;
        
        this.octokit = new Octokit({ auth: this.token });
        this.git = simpleGit(this.localRepoPath);
        
        this.isRunning = false;
        this.lastBackupTime = null;
        this.backupCount = 0;
        
        console.log('✅ GitHub Backup Service Initialized');
        console.log(`📦 Repository: ${this.repoOwner}/${this.repoName}`);
        console.log(`🌿 Branch: ${this.branch}`);
        console.log(`📁 Database: ${this.dbPath}`);
    }

    /**
     * Initialize Git repository if not already initialized
     */
    async initGitRepo() {
        try {
            const isRepo = await this.git.checkIsRepo();
            if (!isRepo) {
                console.log('Initializing git repository...');
                await this.git.init();
                await this.git.addRemote('origin', `https://github.com/${this.repoOwner}/${this.repoName}.git`);
            }
            return true;
        } catch (error) {
            Logger.error('Git init failed', error);
            return false;
        }
    }

    /**
     * Configure Git user
     */
    async configureGitUser() {
        try {
            await this.git.addConfig('user.name', 'Moonlit Promise Bot');
            await this.git.addConfig('user.email', 'bot@moonlitpromise.com');
            return true;
        } catch (error) {
            Logger.error('Git config failed', error);
            return false;
        }
    }

    /**
     * Create .gitignore if not exists
     */
    createGitIgnore() {
        const gitignorePath = path.join(__dirname, '.gitignore');
        if (!fs.existsSync(gitignorePath)) {
            const gitignoreContent = `# Node modules
node_modules/
npm-debug.log
.env
.DS_Store

# Logs
logs/
*.log

# Backups (keep only database)
backups/
*.zip
*.sql

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/

# Dependency directories
node_modules/
jspm_packages/

# dotenv environment variables file
.env
.env.test

# Database files (we track Imposter.db but not others)
*.db-journal
*.db-shm
*.db-wal

# Uploads (don't upload customer images)
public/uploads/*
!public/uploads/.gitkeep

# Temp files
tmp/
temp/`;
            
            fs.writeFileSync(gitignorePath, gitignoreContent);
            console.log('✅ .gitignore created');
        }
    }

    /**
     * Ensure database file is tracked
     */
    async ensureDatabaseTracked() {
        try {
            if (!fs.existsSync(this.dbPath)) {
                console.error('❌ Database file not found!');
                return false;
            }

            const stats = fs.statSync(this.dbPath);
            console.log(`📊 Database size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

            return true;
        } catch (error) {
            Logger.error('Database check failed', error);
            return false;
        }
    }

    /**
     * Commit and push database to GitHub
     */
    async backupToGitHub(commitMessage = null) {
        if (this.isRunning) {
            console.log('⏳ Backup already in progress, skipping...');
            return { success: false, message: 'Backup already in progress' };
        }

        this.isRunning = true;
        
        try {
            console.log('\n' + '='.repeat(50));
            console.log('🚀 Starting GitHub backup...');
            console.log('='.repeat(50));

            await this.initGitRepo();
            await this.configureGitUser();
            this.createGitIgnore();

            const dbOk = await this.ensureDatabaseTracked();
            if (!dbOk) {
                throw new Error('Database file not accessible');
            }

            const status = await this.git.status();
            const hasChanges = status.modified.includes('Imposter.db') || 
                              status.not_added.includes('Imposter.db') ||
                              status.created.includes('Imposter.db');

            if (!hasChanges) {
                console.log('📝 No changes to database since last backup');
                this.isRunning = false;
                return { 
                    success: true, 
                    message: 'No changes to backup',
                    skipped: true 
                };
            }

            console.log('📌 Adding database file...');
            await this.git.add('Imposter.db');

            const defaultMessage = `Auto-backup: Database backup ${new Date().toLocaleString('en-IN')}`;
            const finalMessage = commitMessage || defaultMessage;

            console.log('💾 Committing changes...');
            await this.git.commit(finalMessage);

            console.log('📤 Pushing to GitHub...');
            await this.git.push('origin', this.branch);

            this.lastBackupTime = new Date();
            this.backupCount++;

            const stats = fs.statSync(this.dbPath);
            console.log('✅ Backup completed successfully!');
            console.log(`📁 File: Imposter.db (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
            console.log(`⏰ Time: ${this.lastBackupTime.toLocaleString()}`);
            console.log(`🔢 Backup #: ${this.backupCount}`);
            console.log('='.repeat(50) + '\n');

            Logger.info('GitHub backup completed', {
                size: stats.size,
                backupNumber: this.backupCount,
                commit: finalMessage
            });

            this.isRunning = false;
            return {
                success: true,
                message: 'Backup successful',
                time: this.lastBackupTime,
                backupNumber: this.backupCount,
                size: stats.size
            };

        } catch (error) {
            console.error('❌ Backup failed:', error.message);
            Logger.error('GitHub backup failed', error);
            this.isRunning = false;
            return {
                success: false,
                message: 'Backup failed',
                error: error.message
            };
        }
    }

    /**
     * Get backup history from GitHub
     */
    async getBackupHistory(limit = 10) {
        try {
            const { data } = await this.octokit.repos.listCommits({
                owner: this.repoOwner,
                repo: this.repoName,
                sha: this.branch,
                path: 'Imposter.db',
                per_page: limit
            });

            return data.map(commit => ({
                hash: commit.sha.substring(0, 7),
                message: commit.commit.message,
                author: commit.commit.author.name,
                date: commit.commit.author.date,
                url: commit.html_url
            }));
        } catch (error) {
            Logger.error('Failed to get backup history', error);
            return [];
        }
    }

    /**
     * Restore database from specific commit
     */
    async restoreFromCommit(commitHash) {
        try {
            console.log(`🔄 Restoring from commit ${commitHash}...`);

            const { data } = await this.octokit.repos.getContent({
                owner: this.repoOwner,
                repo: this.repoName,
                path: 'Imposter.db',
                ref: commitHash
            });

            const content = Buffer.from(data.content, 'base64');

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(__dirname, 'backups', `pre-restore-${timestamp}.db`);
            
            if (!fs.existsSync(path.join(__dirname, 'backups'))) {
                fs.mkdirSync(path.join(__dirname, 'backups'), { recursive: true });
            }
            
            fs.copyFileSync(this.dbPath, backupPath);
            console.log(`💾 Current database backed up to: ${backupPath}`);

            fs.writeFileSync(this.dbPath, content);
            console.log('✅ Database restored successfully');

            Logger.info('Database restored from GitHub', {
                commit: commitHash,
                backupPath
            });

            return {
                success: true,
                message: 'Database restored',
                backupPath
            };

        } catch (error) {
            Logger.error('Restore failed', error);
            return {
                success: false,
                message: 'Restore failed',
                error: error.message
            };
        }
    }

    /**
     * Schedule automatic backups
     */
    scheduleBackups(cronExpression = '0 */6 * * *') {
        console.log(`⏰ Scheduling backups: ${cronExpression}`);
        
        cron.schedule(cronExpression, async () => {
            console.log('\n🕐 Running scheduled backup...');
            await this.backupToGitHub(`Scheduled backup ${new Date().toLocaleString('en-IN')}`);
        });

        setTimeout(() => {
            this.backupToGitHub(`Initial backup on server start ${new Date().toLocaleString('en-IN')}`);
        }, 10000);
    }
}

module.exports = GitHubBackupService;
