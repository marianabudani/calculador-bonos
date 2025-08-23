const { EmbedBuilder } = require('discord.js');
const MessageParser = require('./MessageParser');
const WeeklyData = require('../models/WeeklyData');

class ChannelScanner {
    constructor(bot) {
        this.bot = bot;
        this.messageParser = new MessageParser(bot);
        this.lastScanData = null;
    }

    async scanChannelByDate(channel, startDate, endDate, maxMessages = 5000) {
        try {
            console.log(`🔍 Escaneando mensajes desde ${startDate.toLocaleDateString()} hasta ${endDate.toLocaleDateString()}...`);
            
            let allMessages = [];
            let lastMessageId = null;
            let hasMoreMessages = true;
            let messagesOutsideRange = 0;
            
            while (hasMoreMessages && allMessages.length < maxMessages) {
                const fetchOptions = { limit: 100 };
                if (lastMessageId) fetchOptions.before = lastMessageId;
                
                try {
                    const messages = await channel.messages.fetch(fetchOptions);
                    if (messages.size === 0) break;
                    
                    const messagesArray = Array.from(messages.values());
                    
                    for (const msg of messagesArray) {
                        if (msg.createdAt < startDate) {
                            hasMoreMessages = false;
                            break;
                        }
                        
                        if (msg.createdAt <= endDate) {
                            allMessages.push(msg);
                        } else {
                            messagesOutsideRange++;
                        }
                    }
                    
                    if (messagesArray.length > 0) {
                        lastMessageId = messagesArray[messagesArray.length - 1].id;
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (fetchError) {
                    console.error('❌ Error al obtener mensajes:', fetchError.message);
                    break;
                }
            }
            
            console.log(`📊 Escaneo completado: ${allMessages.length} mensajes obtenidos (${messagesOutsideRange} fuera del rango)`);
            
            // Procesar mensajes
            const bonusData = this.processMessages(allMessages);
            
            // Sincronizar con estructura principal
            const syncResult = await this.syncScanDataWithMain(bonusData);
            
            // Guardar datos
            await this.bot.dataManager.saveData();
            
            console.log(`💾 Datos guardados: ${syncResult.syncedWeeks} semanas, ${syncResult.syncedInvoices} facturas`);
            
            // Guardar datos del escaneo para posible uso futuro
            this.lastScanData = bonusData;
            
            return {
                totalMessages: allMessages.length,
                bonusData: bonusData,
                syncResult: syncResult
            };
            
        } catch (error) {
            console.error('❌ Error en scanChannelByDate:', error);
            return {
                totalMessages: 0,
                bonusData: {
                    totalBonuses: 0,
                    employeeBonuses: new Map(),
                    processedMessages: 0,
                    employeesFound: 0,
                    invoicesProcessed: 0,
                    dateRange: { oldest: null, newest: null }
                },
                syncResult: { syncedWeeks: 0, syncedInvoices: 0 }
            };
        }
    }

    async scanChannelHistory(channel, messageCount = 100) {
        try {
            console.log(`🔍 Escaneando ${messageCount} mensajes del canal ${channel.name}...`);
            
            let allMessages = [];
            let lastMessageId = null;
            const maxPerRequest = 100;
            
            const totalRequests = Math.ceil(messageCount / maxPerRequest);
            
            for (let i = 0; i < totalRequests; i++) {
                const remainingMessages = messageCount - allMessages.length;
                const currentLimit = Math.min(maxPerRequest, remainingMessages);
                
                const fetchOptions = { limit: currentLimit };
                if (lastMessageId) fetchOptions.before = lastMessageId;
                
                try {
                    const messages = await channel.messages.fetch(fetchOptions);
                    if (messages.size === 0) break;
                    
                    const messagesArray = Array.from(messages.values());
                    allMessages.push(...messagesArray);
                    
                    lastMessageId = messagesArray[messagesArray.length - 1].id;
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (fetchError) {
                    console.error('❌ Error al obtener mensajes:', fetchError.message);
                    break;
                }
            }
            
            console.log(`📊 Escaneo completado: ${allMessages.length} mensajes obtenidos`);
            
            const bonusData = this.processMessages(allMessages);
            const syncResult = await this.syncScanDataWithMain(bonusData);
            await this.bot.dataManager.saveData();
            
            return {
                totalMessages: allMessages.length,
                bonusData: bonusData,
                syncResult: syncResult
            };
            
        } catch (error) {
            console.error('❌ Error en scanChannelHistory:', error);
            throw error;
        }
    }

    processMessages(messages) {
        const bonusData = {
            totalBonuses: 0,
            employeeBonuses: new Map(),
            processedMessages: 0,
            employeesFound: 0,
            invoicesProcessed: 0,
            dateRange: { oldest: null, newest: null }
        };
        
        try {
            const sortedMessages = messages.sort((a, b) => a.createdAt - b.createdAt);
            
            sortedMessages.forEach((message) => {
                if (!bonusData.dateRange.oldest || message.createdAt < bonusData.dateRange.oldest) {
                    bonusData.dateRange.oldest = message.createdAt;
                }
                if (!bonusData.dateRange.newest || message.createdAt > bonusData.dateRange.newest) {
                    bonusData.dateRange.newest = message.createdAt;
                }
                
                if (message.webhookId && this.isWebhookLog(message.content)) {
                    bonusData.processedMessages++;
                    const lines = message.content.split('\n');
                    
                    for (const line of lines) {
                        this.processLine(line.trim(), bonusData, message.createdAt);
                    }
                }
            });
            
            for (const [, employeeData] of bonusData.employeeBonuses) {
                for (const [, weekData] of employeeData.weeks) {
                    const bonus = Math.round((weekData.totalPaid * this.bot.bonusPercentage) / 100);
                    bonusData.totalBonuses += bonus;
                }
            }
            
        } catch (error) {
            console.error('❌ Error en processMessages:', error);
        }
        
        return bonusData;
    }

    processLine(line, bonusData, timestamp) {
        if (!line) return;
        
        try {
            const parsed = this.messageParser.parseLine(line);
            if (!parsed) return;
            
            const weekKey = this.getWeekKeyFromDate(timestamp);
            
            if (!bonusData.employeeBonuses.has(parsed.dni)) {
                bonusData.employeeBonuses.set(parsed.dni, {
                    name: parsed.type === 'service_entry' ? parsed.name : `Empleado ${parsed.dni}`,
                    weeks: new Map()
                });
                bonusData.employeesFound++;
            }
            
            const employee = bonusData.employeeBonuses.get(parsed.dni);
            
            if (parsed.type === 'service_entry' && parsed.name !== `Empleado ${parsed.dni}`) {
                employee.name = parsed.name;
            }
            
            if (!employee.weeks.has(weekKey)) {
                employee.weeks.set(weekKey, { invoices: [], totalPaid: 0 });
            }
            
            const weekData = employee.weeks.get(weekKey);
            
            switch (parsed.type) {
                case 'invoice_sent':
                    weekData.invoices.push({ amount: parsed.amount, status: 'sent', timestamp });
                    bonusData.invoicesProcessed++;
                    break;
                    
                case 'invoice_paid':
                    const pending = weekData.invoices.find(inv => 
                        inv.amount === parsed.amount && inv.status === 'sent');
                    
                    if (pending) {
                        pending.status = 'paid';
                    } else {
                        weekData.invoices.push({ amount: parsed.amount, status: 'paid', timestamp });
                    }
                    weekData.totalPaid += parsed.amount;
                    bonusData.invoicesProcessed++;
                    break;
            }
        } catch (error) {
            console.error('❌ Error procesando línea:', error);
        }
    }

    async syncScanDataWithMain(bonusData) {
        try {
            let syncedCount = 0;
            let invoiceCount = 0;

            if (!bonusData || !bonusData.employeeBonuses) {
                return { syncedWeeks: 0, syncedInvoices: 0 };
            }

            for (const [dni, employeeData] of bonusData.employeeBonuses) {
                let employee = this.bot.dataManager.getEmployee(dni);
                if (!employee) {
                    employee = this.bot.dataManager.registerEmployee(dni, employeeData.name);
                } else if (employee.name.startsWith('Empleado ') && !employeeData.name.startsWith('Empleado ')) {
                    employee.name = employeeData.name;
                }

                if (employeeData.weeks) {
                    for (const [weekKey, weekScanData] of employeeData.weeks) {
                        const weekData = employee.getWeekData(weekKey);
                        
                        if (weekScanData.invoices) {
                            for (const invoice of weekScanData.invoices) {
                                const exists = weekData.invoices.some(existingInvoice =>
                                    existingInvoice.amount === invoice.amount &&
                                    existingInvoice.status === invoice.status
                                );
                                
                                if (!exists) {
                                    weekData.invoices.push(invoice);
                                    invoiceCount++;
                                    
                                    if (invoice.status === 'paid') {
                                        weekData.totalPaid += invoice.amount;
                                    }
                                }
                            }
                        }
                        
                        syncedCount++;
                    }
                }
            }

            console.log(`🔄 Sincronizados: ${syncedCount} semanas, ${invoiceCount} facturas`);
            return { syncedWeeks: syncedCount, syncedInvoices: invoiceCount };
        } catch (error) {
            console.error('❌ Error en syncScanDataWithMain:', error);
            return { syncedWeeks: 0, syncedInvoices: 0 };
        }
    }

    getWeekKeyFromDate(date) {
        const startOfYear = new Date(date.getFullYear(), 0, 1);
        const days = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
        
        const dayOfWeek = date.getDay();
        const mondayAdjustment = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const mondayOfThisWeek = new Date(date);
        mondayOfThisWeek.setDate(date.getDate() + mondayAdjustment);
        
        const weekNumber = Math.ceil(((mondayOfThisWeek - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
        return `${date.getFullYear()}-${weekNumber}`;
    }

    isWebhookLog(content) {
        return content.includes('[UDT') || 
               content.includes('ha enviado una factura') || 
               content.includes('ha pagado una factura');
    }

    createScanEmbed(result, title, additionalFields = []) {
        const fields = [
            {
                name: '📊 Mensajes Procesados',
                value: `${result.totalMessages || 0} mensajes escaneados\n${result.processedMessages || 0} mensajes de webhook procesados`,
                inline: true
            },
            {
                name: '👥 Empleados Encontrados',
                value: `${result.employeesFound || 0} empleados`,
                inline: true
            },
            {
                name: '📄 Facturas Procesadas',
                value: `${result.invoicesProcessed || 0} facturas`,
                inline: true
            },
            {
                name: '🎁 Bonos Calculados',
                value: `$${result.totalBonuses || 0} (${this.bot.bonusPercentage}%)`,
                inline: true
            },
            ...additionalFields
        ];

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor('#00ff00')
            .addFields(fields)
            .setTimestamp();

        return embed;
    }
}

module.exports = ChannelScanner;