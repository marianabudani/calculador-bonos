const MessageParser = require('../services/MessageParser');
const BonusCommands = require('../commands/bonusCommands');
const ConfigCommands = require('../commands/configCommands');
const ScanCommands = require('../commands/scanCommands');
const HelperCommands = require('../commands/helperCommands');

class MessageHandler {
    constructor(bot) {
        this.bot = bot;
        this.messageParser = new MessageParser(bot);
        this.bonusCommands = new BonusCommands(bot);
        this.configCommands = new ConfigCommands(bot);
        this.scanCommands = new ScanCommands(bot);
        this.helperCommands = new HelperCommands(bot);
    }

    async handleMessage(message) {
        if (message.author.bot && !this.isFromWebhook(message)) return;
        
        const channelId = message.channel.id;
        
        // Procesar logs del webhook
        if (this.messageParser.isWebhookLog(message.content)) {
            if (this.canProcessInChannel(channelId, 'log')) {
                await this.processWebhookLog(message);
            }
            return;
        }
        
        // Procesar comandos del bot
        if (!message.author.bot && message.content.startsWith('!')) {
            if (this.canProcessInChannel(channelId, 'command')) {
                await this.handleCommand(message);
            }
        }
    }

    isFromWebhook(message) {
        return message.webhookId !== null;
    }

    canProcessInChannel(channelId, type) {
        if (this.bot.config.allowAllChannels) return true;
        
        const channelIds = type === 'log' ? 
            this.bot.config.logChannelIds : 
            this.bot.config.commandChannelIds;
            
        return channelIds.length === 0 || channelIds.includes(channelId);
    }

    async processWebhookLog(message) {
        console.log(`📋 Procesando log del canal: ${message.channel.name}`);
        
        // Actualizar semana actual
        this.bot.currentWeek = this.bot.getCurrentWeekKey();
        
        const results = await this.messageParser.processWebhookLog(
            message.content,
            this.bot.dataManager,
            this.bot.currentWeek
        );
        
        console.log(`✅ Procesados: ${results.employeesRegistered} empleados, ${results.invoicesProcessed} facturas`);
    }

    async handleCommand(message) {
        const args = message.content.slice(1).trim().split(/ +/);
        const command = args[0].toLowerCase();
        
        try {
            console.log(`🤖 Procesando comando: ${command}`);
            
            switch (command) {
                case 'bonos':
                    await this.bonusCommands.handleBonos(message);
                break;
                case 'bonossemana':
                    await this.bonusCommands.handleBonosSemana(message, args[1]);
                break;
                case 'cerrarsemana':
                    await this.bonusCommands.handleCerrarSemana(message);
                break;
                case 'historial':
                    await this.bonusCommands.handleHistorial(message, args[1]);
                break;
                case 'empleados':
                    await this.bonusCommands.handleEmpleados(message);
                break;
                    
                case 'setbono':
                    await this.configCommands.handleSetBono(message, args[1]);
                break;
                case 'config':
                    await this.configCommands.handleConfig(message);
                break;
                case 'setchannel':
                    await this.configCommands.handleSetChannel(message, args);
                break;
                case 'reset':
                    await this.configCommands.handleReset(message);
                break;
                    
                case 'scanfecha':
                    await this.scanCommands.handleScanFecha(message, args);
                break;
                case 'scan':
                case 'escanear':
                    await this.scanCommands.handleScan(message, args);
                break;
                    
                case 'semana':
                    await this.helperCommands.handleSemana(message);
                break;
                case 'help':
                case 'ayuda':
                    await this.helperCommands.handleHelp(message);
                break;
                case 'syncdata':
                    await this.configCommands.handleSyncData(message);
                break;
                default:
                    await message.reply('❓ Comando no reconocido. Usa `!ayuda` para ver comandos disponibles.');
            }
        } catch (error) {
            console.error('❌ Error en handleCommand:', error);
            await message.reply(`❌ Error al procesar el comando: ${error.message}`);
        }
    }
}

module.exports = MessageHandler;