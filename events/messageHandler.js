const BonusCommands = require('../commands/bonusCommands');
const ConfigCommands = require('../commands/configCommands');
const HelperCommands = require('../commands/helperCommands');
const ScanCommands = require('../commands/scanCommands');

// Clase MessageParser integrada en el mismo archivo
class MessageParser {
    constructor(bot) {
        this.bot = bot;
        this.patterns = {
            serviceEntry: /^\*\*\[([A-Z]{3}\d+)\]\s+([^*]+?)\*\*\s+ha entrado en servicio/,
            invoiceSent: /^\*\*\[([A-Z]{3}\d+)\]\*\*\s+ha enviado una factura\s+`\$(\d+)\s+\(([^)]+)\)`/,
            invoicePaid: /^\*\*[^*]+\*\*\s+ha pagado una factura\s+`\$(\d+)\s+\(([^)]+)\)`\s+de\s+\*\*\[([A-Z]{3}\d+)\]\**/,
            // PATRONES CORREGIDOS PARA INVENTARIO
            inventoryWithdraw: /^\[([A-Z]{3}\d+)\]\s+(.+?)\s+(ha retirado|retiró)\s+x?(\d+)\s+(.+?)\.?$/i,
            inventoryDeposit: /^\[([A-Z]{3}\d+)\]\s+(.+?)\s+(ha guardado|guardó)\s+x?(\d+)\s+(.+?)\.?$/i,
            // Patrones adicionales más flexibles
            inventoryGeneral: /^\[([A-Z]{3}\d+)\]\s+(.+?)\s+(ha guardado|ha retirado|guardó|retiró)\s+x?(\d+)\s+(.+?)\.?$/i
        };
    }

    isWebhookLog(content) {
        return content.includes('[UDT') || 
               content.includes('ha enviado una factura') || 
               content.includes('ha pagado una factura') ||
               this.isInventoryLog(content);
    }

    // Mejorar detección de logs de inventario
    isInventoryLog(content) {
        const inventoryPatterns = [
            /\[[A-Z]{3}\d+\].*?(ha guardado|ha retirado|guardó|retiró)\s+x?\d+/i,
            /\[[A-Z]{3}\d+\].*?(depositado|retirado).*?\$?\d+/i
        ];
        
        return inventoryPatterns.some(pattern => pattern.test(content));
    }

    parseLine(line) {
        line = line.trim();
        if (!line) return null;

        console.log(`🔍 Parseando línea: ${line}`); // DEBUG

        // Parsear entrada de servicio
        const serviceMatch = line.match(this.patterns.serviceEntry);
        if (serviceMatch) {
            const [, dni, name] = serviceMatch;
            console.log(`✅ Service entry: ${dni} - ${name}`); // DEBUG
            return { type: 'service_entry', dni, name: name.trim().replace(/\*+/g, '') };
        }

        // Parsear factura enviada
        const invoiceMatch = line.match(this.patterns.invoiceSent);
        if (invoiceMatch) {
            const [, dni, amount] = invoiceMatch;
            console.log(`✅ Invoice sent: ${dni} - $${amount}`); // DEBUG
            return { type: 'invoice_sent', dni, amount: parseInt(amount) };
        }

        // Parsear factura pagada
        const paidMatch = line.match(this.patterns.invoicePaid);
        if (paidMatch) {
            const [, amount, , dni] = paidMatch;
            console.log(`✅ Invoice paid: ${dni} - $${amount}`); // DEBUG
            return { type: 'invoice_paid', dni, amount: parseInt(amount) };
        }

        // PARSING DE INVENTARIO MEJORADO
        // Intentar con patrón de retiro específico
        let inventoryMatch = line.match(this.patterns.inventoryWithdraw);
        if (inventoryMatch) {
            const [, dni, name, action, quantity, item] = inventoryMatch;
            console.log(`✅ Inventory withdraw: ${dni} - ${name} - ${quantity} ${item}`); // DEBUG
            return {
                type: 'inventory_action',
                dni: dni.toUpperCase(),
                name: name.trim(),
                action: 'withdraw',
                quantity: parseInt(quantity),
                item: item.trim()
            };
        }

        // Intentar con patrón de depósito específico
        inventoryMatch = line.match(this.patterns.inventoryDeposit);
        if (inventoryMatch) {
            const [, dni, name, action, quantity, item] = inventoryMatch;
            console.log(`✅ Inventory deposit: ${dni} - ${name} - ${quantity} ${item}`); // DEBUG
            return {
                type: 'inventory_action',
                dni: dni.toUpperCase(),
                name: name.trim(),
                action: 'deposit',
                quantity: parseInt(quantity),
                item: item.trim()
            };
        }

        // Intentar con patrón general como respaldo
        inventoryMatch = line.match(this.patterns.inventoryGeneral);
        if (inventoryMatch) {
            const [, dni, name, actionText, quantity, item] = inventoryMatch;
            const action = actionText.includes('guardado') || actionText.includes('guardó') ? 'deposit' : 'withdraw';
            console.log(`✅ Inventory general: ${dni} - ${name} - ${action} - ${quantity} ${item}`); // DEBUG
            return {
                type: 'inventory_action',
                dni: dni.toUpperCase(),
                name: name.trim(),
                action: action,
                quantity: parseInt(quantity),
                item: item.trim()
            };
        }

        // Patrones adicionales para casos especiales
        const specialPatterns = [
            // Patrón sin corchetes
            /^(\w+)\s+(.+?)\s+(ha guardado|ha retirado|guardó|retiró)\s+x?(\d+)\s+(.+?)\.?$/i,
            // Patrón con formato diferente
            /^\[(\w+)\]\s*(.+?)\s*-\s*(guardó|retiró|ha guardado|ha retirado)\s+x?(\d+)\s+(.+?)\.?$/i
        ];

        for (const pattern of specialPatterns) {
            const match = line.match(pattern);
            if (match) {
                const [, dni, name, actionText, quantity, item] = match;
                const action = actionText.includes('guardado') || actionText.includes('guardó') ? 'deposit' : 'withdraw';
                console.log(`✅ Special inventory pattern: ${dni} - ${name} - ${action} - ${quantity} ${item}`); // DEBUG
                return {
                    type: 'inventory_action',
                    dni: dni.toUpperCase(),
                    name: name.trim(),
                    action: action,
                    quantity: parseInt(quantity),
                    item: item.trim()
                };
            }
        }

        console.log(`⚠ No se pudo parsear: ${line}`); // DEBUG
        return null;
    }

    async processWebhookLog(logContent, dataManager, weekKey) {
        const lines = logContent.split('\n');
        const results = {
            employeesRegistered: 0,
            employeesUpdated: 0,
            invoicesProcessed: 0,
            inventoryProcessed: 0,
            errors: 0
        };

        console.log(`📋 Procesando ${lines.length} líneas de log...`); // DEBUG

        for (const line of lines) {
            try {
                const parsed = this.parseLine(line);
                if (!parsed) continue;

                switch (parsed.type) {
                    case 'service_entry':
                        const employee = dataManager.registerEmployee(parsed.dni, parsed.name);
                        if (employee.name === parsed.name) {
                            results.employeesRegistered++;
                        } else {
                            results.employeesUpdated++;
                        }
                        break;

                    case 'invoice_sent':
                        let employeeSent = dataManager.getEmployee(parsed.dni);
                        if (!employeeSent) {
                            employeeSent = dataManager.registerEmployee(parsed.dni, `Empleado ${parsed.dni}`);
                            results.employeesRegistered++;
                        }
                        
                        const weekDataSent = employeeSent.getWeekData(weekKey);
                        weekDataSent.addInvoice(parsed.amount, 'sent');
                        results.invoicesProcessed++;
                        break;

                    case 'invoice_paid':
                        let employeePaid = dataManager.getEmployee(parsed.dni);
                        
                        if (!employeePaid) {
                            employeePaid = dataManager.registerEmployee(parsed.dni, `Empleado ${parsed.dni}`);
                            results.employeesRegistered++;
                        }

                        const weekDataPaid = employeePaid.getWeekData(weekKey);
                        if (!weekDataPaid.markInvoiceAsPaid(parsed.amount)) {
                            weekDataPaid.addInvoice(parsed.amount, 'paid');
                        }
                        results.invoicesProcessed++;
                        break;

                    case 'inventory_action':
                        console.log(`📦 Procesando acción de inventario:`, parsed); // DEBUG
                        
                        // INTEGRACIÓN CORRECTA CON INVENTORY SERVICE
                        if (this.bot && this.bot.inventoryService) {
                            try {
                                const success = this.bot.inventoryService.registerInventoryMovement(
                                    parsed.dni,
                                    parsed.name,
                                    parsed.item,
                                    parsed.quantity,
                                    parsed.action,
                                    new Date()
                                );
                                
                                if (success) {
                                    results.inventoryProcessed++;
                                    console.log(`✅ Movimiento de inventario registrado: ${parsed.dni} - ${parsed.action} - ${parsed.quantity} ${parsed.item}`);
                                    
                                    // Registrar empleado si no existe
                                    let inventoryEmployee = dataManager.getEmployee(parsed.dni);
                                    if (!inventoryEmployee) {
                                        inventoryEmployee = dataManager.registerEmployee(parsed.dni, parsed.name);
                                        results.employeesRegistered++;
                                    } else if (inventoryEmployee.name.startsWith('Empleado ') && !parsed.name.startsWith('Empleado ')) {
                                        inventoryEmployee.name = parsed.name;
                                        results.employeesUpdated++;
                                    }
                                } else {
                                    console.log(`⚠ Error registrando movimiento de inventario`);
                                    results.errors++;
                                }
                            } catch (invError) {
                                console.error('❌ Error en inventory service:', invError);
                                results.errors++;
                            }
                        } else {
                            console.log(`⚠ InventoryService no disponible`);
                            results.errors++;
                        }
                        break;
                }
            } catch (error) {
                console.error('❌ Error procesando línea:', error);
                console.error('Línea problemática:', line);
                results.errors++;
            }
        }

        console.log(`✅ Procesados: ${results.employeesRegistered} empleados registrados, ${results.employeesUpdated} actualizados, ${results.invoicesProcessed} facturas, ${results.inventoryProcessed} movimientos inventario, ${results.errors} errores`);
        return results;
    }
}

// Clase principal MessageHandler
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
            case 'inventario-setbase':
                if (this.bot.inventoryService) {
                    await this.bot.inventoryService.handleSetBaseCommand(message, args);
                } else {
                    await message.reply('❌ Servicio de inventario no disponible.');
                }
                break;

            case 'inventario-loadbase':
                if (this.bot.inventoryService) {
                    await this.bot.inventoryService.handleLoadBaseCommand(message);
                } else {
                    await message.reply('❌ Servicio de inventario no disponible.');
                }
                break;

            case 'inventario-baseconfig':
                if (this.bot.inventoryService) {
                    await this.bot.inventoryService.showBaseStockConfiguration(message);
                } else {
                    await message.reply('❌ Servicio de inventario no disponible.');
                }
                break;

                case 'inventario-comparar':
                    if (this.bot.inventoryService) {
                        await this.bot.inventoryService.showStockComparison(message);
                    } else {
                        await message.reply('❌ Servicio de inventario no disponible.');
                    }
                    break;
                case 'inventario-empleado':
                    if (this.bot.inventoryService && args[1]) {
                        await this.bot.inventoryService.showEmployeeWeeklyInventory(message, args[1], args[2]);
                    } else if (!this.bot.inventoryService) {
                        await message.reply('❌ Servicio de inventario no disponible.');
                    } else {
                        await message.reply('❌ Uso: `!inventario-empleado [DNI] [semana_opcional]`\nEjemplo: `!inventario-empleado ABC123 2025-37`');
                    }
                    break;

                case 'inventario-export':
                    if (this.bot.inventoryService) {
                        await this.bot.inventoryService.exportInventoryData(message);
                    } else {
                        await message.reply('❌ Servicio de inventario no disponible.');
                    }
                    break;

                case 'inventario-top':
                    if (this.bot.inventoryService) {
                        await this.bot.inventoryService.showTopWithdrawals(message, args[1]);
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

            // Comandos nuevos de inventario expandido
            case 'inventarioempleado':
                if (this.bot.inventoryService && args[1]) {
                    await this.bot.inventoryService.showEmployeeWeeklyInventory(message, args[1], args[2]);
                } else if (!this.bot.inventoryService) {
                    await message.reply('❌ Servicio de inventario no disponible.');
                } else {
                    await message.reply('❌ Uso: `!inventarioempleado [DNI] [semana_opcional]`\nEjemplo: `!inventarioempleado ABC123 2025-37`');
                }
                break;

            case 'exportarinventario':
                if (this.bot.inventoryService) {
                    await this.bot.inventoryService.exportInventoryData(message);
                } else {
                    await message.reply('❌ Servicio de inventario no disponible.');
                }
                break;

            case 'topretiros':
                if (this.bot.inventoryService) {
                    await this.bot.inventoryService.showTopWithdrawals(message, args[1]);
                } else {
                    await message.reply('❌ Servicio de inventario no disponible.');
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