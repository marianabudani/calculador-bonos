const BonusCommands = require('../commands/bonusCommands');
const ConfigCommands = require('../commands/configCommands');
const HelperCommands = require('../commands/helperCommands');
const ScanCommands = require('../commands/scanCommands');
const MessageParser = require('../services/MessageParser');

class MessageHandler {
    constructor(bot) {
        this.bot = bot;
        this.bonusCommands = new BonusCommands(bot);
        this.configCommands = new ConfigCommands(bot);
        this.helperCommands = new HelperCommands(bot);
        this.scanCommands = new ScanCommands(bot);
        this.messageParser = new MessageParser(bot);
    }

    async handleMessage(message) {
        // Ignorar mensajes del bot
        if (message.author.bot && !message.webhookId) return;

        // Procesar logs de webhook
        if (message.webhookId && this.isWebhookChannel(message.channel.id)) {
            await this.processWebhookLog(message);
            return;
        }

        // Procesar comandos solo de usuarios (no bots)
        if (message.author.bot) return;

        // Verificar si el canal permite comandos
        if (!this.isCommandChannel(message.channel.id)) return;

        // Procesar comandos que empiecen con !
        if (!message.content.startsWith('!')) return;

        const args = message.content.slice(1).trim().split(/\s+/);
        const command = args[0].toLowerCase();

        try {
            await this.executeCommand(command, message, args);
        } catch (error) {
            console.error(`❌ Error ejecutando comando ${command}:`, error);
            await message.reply('❌ Ocurrió un error al ejecutar el comando.');
        }
    }

    async executeCommand(command, message, args) {
        switch (command) {
            // Comandos de bonos
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

            // Comandos de configuración
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

            case 'syncdata':
                await this.configCommands.handleSyncData(message);
                break;

            case 'repararnombres':
                await this.configCommands.handleRepararNombres(message);
                break;

            // Comandos de escaneo
            case 'scanfecha':
                await this.scanCommands.handleScanFecha(message, args);
                break;

            case 'scan':
                await this.scanCommands.handleScan(message, args);
                break;

            // Comandos de ayuda
            case 'semana':
                await this.helperCommands.handleSemana(message);
                break;

            case 'ayuda':
            case 'help':
                await this.helperCommands.handleHelp(message);
                break;

            // Comandos de inventario
            case 'inventario':
                if (this.bot.inventoryService) {
                    await this.bot.inventoryService.showInventory(message);
                } else {
                    await message.reply('❌ Servicio de inventario no disponible.');
                }
                break;

            case 'valorretiros':
                if (this.bot.inventoryService) {
                    await this.bot.inventoryService.calculateWithdrawValue(message);
                } else {
                    await message.reply('❌ Servicio de inventario no disponible.');
                }
                break;

            case 'procesarlog':
                if (this.bot.inventoryService) {
                    await this.bot.inventoryService.processLogCommand(message);
                } else {
                    await message.reply('❌ Servicio de inventario no disponible.');
                }
                break;

            case 'retirosdni':
                if (this.bot.inventoryService && args[1]) {
                    await this.bot.inventoryService.showEmployeeLogs(message, args[1]);
                } else if (!this.bot.inventoryService) {
                    await message.reply('❌ Servicio de inventario no disponible.');
                } else {
                    await message.reply('❌ Uso: `!retirosdni [DNI]`');
                }
                break;

            default:
                // No responder a comandos desconocidos para evitar spam
                break;
        }
    }

    async processWebhookLog(message) {
        try {
            if (!this.messageParser.isWebhookLog(message.content)) return;

            const result = await this.messageParser.processWebhookLog(
                message.content,
                this.bot.dataManager,
                this.bot.currentWeek
            );

            // Guardar datos después de procesar
            if (result.employeesRegistered > 0 || result.invoicesProcessed > 0 || result.inventoryProcessed > 0) {
                await this.bot.dataManager.saveData();
            }

        } catch (error) {
            console.error('❌ Error procesando webhook log:', error);
        }
    }

    isWebhookChannel(channelId) {
        if (this.bot.config.allowAllChannels) return true;
        return this.bot.config.logChannelIds.length === 0 || 
               this.bot.config.logChannelIds.includes(channelId);
    }

    isCommandChannel(channelId) {
        if (this.bot.config.allowAllChannels) return true;
        return this.bot.config.commandChannelIds.length === 0 || 
               this.bot.config.commandChannelIds.includes(channelId);
    }
}

module.exports = MessageHandler;