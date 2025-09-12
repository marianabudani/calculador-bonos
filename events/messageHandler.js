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
        
        // Procesar logs del webhook (ahora incluye inventario)
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
        
        console.log(`✅ Procesados: ${results.employeesRegistered} empleados, ${results.invoicesProcessed} facturas, ${results.inventoryProcessed} movimientos inventario`);
    }

    async handleCommand(message) {
        const args = message.content.slice(1).trim().split(/ +/);
        const command = args[0].toLowerCase();
        
        try {
            console.log(`🤖 Procesando comando: ${command}`);
            
            switch (command) {
                // ===== COMANDOS DE BONOS =====
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
                    
                // ===== COMANDOS DE CONFIGURACIÓN =====
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
                case 'reparar':
                    await this.configCommands.handleRepararNombres(message);
                    break;
                    
                // ===== COMANDOS DE ESCANEO =====
                case 'scanfecha':
                    await this.scanCommands.handleScanFecha(message, args);
                    break;
                case 'scan':
                case 'escanear':
                    await this.scanCommands.handleScan(message, args);
                    break;
                    
                // ===== COMANDOS DE AYUDA =====
                case 'semana':
                    await this.helperCommands.handleSemana(message);
                    break;
                case 'help':
                case 'ayuda':
                    await this.helperCommands.handleHelp(message);
                    break;
                
                // ===== COMANDOS DE INVENTARIO =====
                case 'inventario':
                case 'inv':
                    await this.bot.inventoryService.showInventory(message);
                    break;

                case 'inventario-valor':
                case 'valorretiros':
                    await this.bot.inventoryService.calculateWithdrawValue(message);
                    break;

                case 'inventario-log':
                case 'procesarlog':
                    await this.bot.inventoryService.processLogCommand(message);
                    break;

                case 'inventario-empleado':
                case 'retirosdni':
                    if (!args[1]) {
                        return message.reply("❌ Uso: `!inventario-empleado <DNI>` o `!retirosdni <DNI>`");
                    }
                    await this.bot.inventoryService.showEmployeeLogs(message, args[1]);
                    break;

                case 'inventario-top':
                    const limit = parseInt(args[1]) || 10;
                    await this.bot.inventoryService.showTopEmployees(message, Math.min(limit, 20));
                    break;

                case 'inventario-stats':
                    await this.handleInventoryStats(message);
                    break;

                case 'inventario-reset':
                    await this.handleInventoryReset(message);
                    break;

                case 'inventario-precios':
                    await this.handleInventoryPrices(message);
                    break;

                // ===== COMANDO GENERAL DE PROCESAMIENTO =====
                case 'procesar':
                    await this.handleProcesar(message);
                    break;
                    
                default:
                    await message.reply('❓ Comando no reconocido. Usa `!ayuda` para ver comandos disponibles.');
            }
        } catch (error) {
            console.error('❌ Error en handleCommand:', error);
            await message.reply(`❌ Error al procesar el comando: ${error.message}`);
        }
    }

    // NUEVO: Mostrar estadísticas de inventario
    async handleInventoryStats(message) {
        const stats = this.bot.inventoryService.getStats();
        
        const embed = {
            title: "📊 Estadísticas de Inventario",
            color: 0x3498db,
            fields: [
                { name: "Total Logs", value: stats.totalLogs.toString(), inline: true },
                { name: "Depósitos", value: stats.totalDeposits.toString(), inline: true },
                { name: "Retiros", value: stats.totalWithdrawals.toString(), inline: true },
                { name: "Valor Total Retiros", value: `$${stats.totalValue}`, inline: true },
                { name: "Empleados Únicos", value: stats.uniqueEmployees.toString(), inline: true },
                { name: "Items Únicos", value: stats.uniqueItems.toString(), inline: true }
            ],
            timestamp: new Date().toISOString()
        };

        await message.reply({ embeds: [embed] });
    }

    // NUEVO: Reset de inventario (comando administrativo)
    async handleInventoryReset(message) {
        // Verificar permisos (opcional - puedes agregar verificación de roles)
        if (!message.member.permissions.has('ADMINISTRATOR')) {
            return message.reply("❌ Este comando requiere permisos de administrador.");
        }

        const confirmEmbed = {
            title: "⚠️ Confirmar Reset de Inventario",
            description: "¿Estás seguro de que quieres resetear completamente el inventario? Esta acción no se puede deshacer.",
            color: 0xff9800
        };

        const confirmMsg = await message.reply({ embeds: [confirmEmbed] });
        await confirmMsg.react('✅');
        await confirmMsg.react('❌');

        const filter = (reaction, user) => {
            return ['✅', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;
        };

        try {
            const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: 30000, errors: ['time'] });
            const reaction = collected.first();

            if (reaction.emoji.name === '✅') {
                this.bot.inventoryService.resetInventory();
                await message.reply("✅ Inventario reseteado completamente.");
            } else {
                await message.reply("❌ Reset cancelado.");
            }
        } catch {
            await message.reply("⏰ Tiempo agotado. Reset cancelado.");
        }
    }

    // NUEVO: Mostrar precios de inventario
    async handleInventoryPrices(message) {
        const prices = this.bot.inventoryService.prices;
        
        let description = "";
        const sortedPrices = Object.entries(prices)
            .sort(([,a], [,b]) => b - a)
            .filter(([,price]) => price > 0);

        for (const [item, price] of sortedPrices) {
            const itemName = item.charAt(0).toUpperCase() + item.slice(1);
            description += `**${itemName}**: $${price}\n`;
        }

        if (description === "") {
            description = "No hay items con precio configurado.";
        }

        const embed = {
            title: "💰 Precios de Items de Inventario",
            description: description,
            color: 0x2ecc71,
            footer: { text: "Solo los items con precio > 0 se auditan en retiros" },
            timestamp: new Date().toISOString()
        };

        await message.reply({ embeds: [embed] });
    }

    // NUEVO: Comando para procesar logs mixtos
    async handleProcesar(message) {
        const lines = message.content.split("\n").slice(1); // Saltar primera línea del comando
        let invoiceResults = {
            employeesRegistered: 0,
            employeesUpdated: 0,
            invoicesProcessed: 0,
            inventoryProcessed: 0,
            errors: 0
        };

        for (const line of lines) {
            if (line.trim()) {
                try {
                    // Intentar procesar como log de webhook (facturas)
                    if (this.messageParser.isWebhookLog(line)) {
                        const results = await this.messageParser.processWebhookLog(
                            line,
                            this.bot.dataManager,
                            this.bot.currentWeek
                        );
                        invoiceResults.employeesRegistered += results.employeesRegistered;
                        invoiceResults.employeesUpdated += results.employeesUpdated;
                        invoiceResults.invoicesProcessed += results.invoicesProcessed;
                        invoiceResults.inventoryProcessed += results.inventoryProcessed;
                    }
                    // También intentar procesar como inventario directo
                    else if (this.bot.inventoryService.parseInventoryLine(line)) {
                        invoiceResults.inventoryProcessed++;
                    }
                } catch (error) {
                    invoiceResults.errors++;
                    console.error('Error procesando línea:', line, error);
                }
            }
        }

        const embed = {
            title: "✅ Log Procesado",
            color: 0x00ff00,
            fields: [
                { name: "Empleados Registrados", value: invoiceResults.employeesRegistered.toString(), inline: true },
                { name: "Empleados Actualizados", value: invoiceResults.employeesUpdated.toString(), inline: true },
                { name: "Facturas Procesadas", value: invoiceResults.invoicesProcessed.toString(), inline: true },
                { name: "Inventario Procesado", value: invoiceResults.inventoryProcessed.toString(), inline: true },
                { name: "Errores", value: invoiceResults.errors.toString(), inline: true },
                { name: "Total Líneas", value: lines.length.toString(), inline: true }
            ],
            timestamp: new Date().toISOString()
        };

        await message.reply({ embeds: [embed] });

        // Guardar datos si hubo cambios
        if (invoiceResults.employeesRegistered + invoiceResults.invoicesProcessed + invoiceResults.inventoryProcessed > 0) {
            await this.bot.dataManager.saveData();
        }
    }
}

module.exports = MessageHandler;