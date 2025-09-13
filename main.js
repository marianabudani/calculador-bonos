const { Client, GatewayIntentBits } = require('discord.js');
const MessageHandler = require('./events/messageHandler');
const DataManager = require('./services/DataManager');
const BonusCalculator = require('./services/BonusCalculator');
const ChannelScanner = require('./services/ChannelScanner');
const InventoryService = require('./services/InventoryControl');
const { loadConfig } = require('./config/default');
require('dotenv').config();

class EmployeeBonusBot {
    constructor(token, config = {}) {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers
            ]
        });
        
        this.token = token;
        this.config = loadConfig(config);
        this.employees = new Map();
        this.bonusPercentage = this.config.bonusPercentage;
        this.currentWeek = this.getCurrentWeekKey();
        this.dataManager = new DataManager(this);
        this.bonusCalculator = new BonusCalculator(this.bonusPercentage);
        this.channelScanner = new ChannelScanner(this);
        this.inventoryService = new InventoryService(this);
        this.messageHandler = new MessageHandler(this);
        
        this.setupEventHandlers();
    }

    getCurrentWeekKey() {
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        
        const dayOfWeek = now.getDay();
        const mondayAdjustment = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const mondayOfThisWeek = new Date(now);
        mondayOfThisWeek.setDate(now.getDate() + mondayAdjustment);
        
        const weekNumber = Math.ceil(((mondayOfThisWeek - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
        return `${now.getFullYear()}-${weekNumber}`;
    }

    setupEventHandlers() {
        this.client.once('clientReady', () => {
            console.log(`Bot conectado como ${this.client.user.tag}`);
            console.log(`Semana actual: ${this.currentWeek}`);
        });

        this.client.on('messageCreate', (message) => {
            this.messageHandler.handleMessage(message);
        });
    }

    async start() {
        await this.dataManager.loadData();
        const repairedCount = this.dataManager.repairEmployees();
        if (repairedCount > 0) {
            console.log(`🔧 Reparados ${repairedCount} empleados inválidos`);
            await this.dataManager.saveData();
        }
        this.bonusCalculator.setBonusPercentage(this.bonusPercentage);
        await this.client.login(this.token);
    }
    setBonusPercentage(percentage) {
        if (this.bonusCalculator.setBonusPercentage(percentage)) {
            this.bonusPercentage = percentage;
            return true;
        }
        return false;
    }
}

if (require.main === module) {
    const bot = new EmployeeBonusBot(process.env.DISCORD_TOKEN);
    bot.start().catch(console.error);
}

module.exports = EmployeeBonusBot;