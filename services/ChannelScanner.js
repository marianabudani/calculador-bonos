const { EmbedBuilder } = require('discord.js');
const MessageParser = require('./MessageParser');

class ChannelScanner {
    constructor(bot) {
        this.bot = bot;
        this.messageParser = new MessageParser(bot);
    }

    async scanChannelByDate(channel, startDate, endDate, maxMessages = 5000) {
        try {
            console.log(`🔍 Escaneando mensajes desde ${startDate.toLocaleDateString()} hasta ${endDate.toLocaleDateString()}...`);
            
            let allMessages = [];
            let lastMessageId = null;
            let hasMoreMessages = true;
            
            while (hasMoreMessages && allMessages.length < maxMessages) {
                const fetchOptions = { limit: 100 };
                if (lastMessageId) fetchOptions.before = lastMessageId;
                
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
                    }
                }
                 // Procesar mensajes
                const bonusData = this.processMessages(allMessages);
        
                // Sincronizar con estructura principal
                const syncResult = await this.syncScanDataWithMain(bonusData);
                
                // Guardar datos
                await this.bot.dataManager.saveData();
                
                console.log(`💾 Datos guardados: ${syncResult.syncedWeeks} semanas, ${syncResult.syncedInvoices} facturas`);
                
                lastMessageId = messagesArray[messagesArray.length - 1].id;
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            return {
                totalMessages: allMessages.length,
                bonusData: bonusData,
                syncResult: syncResult
            }
        } catch (error) {
            console.error('❌ Error en scanChannelByDate:', error);
            return {
                totalMessages: 0,
                bonusData: { /* estructura default */ },
                syncResult: { syncedWeeks: 0, syncedInvoices: 0 }
            };
        }
    }

    async scanChannelHistory(channel, messageCount = 100) {
        try {
            let allMessages = [];
            let lastMessageId = null;
            const totalRequests = Math.ceil(messageCount / 100);
            
            for (let i = 0; i < totalRequests; i++) {
                const remaining = messageCount - allMessages.length;
                const limit = Math.min(100, remaining);
                
                const fetchOptions = { limit };
                if (lastMessageId) fetchOptions.before = lastMessageId;
                
                const messages = await channel.messages.fetch(fetchOptions);
                if (messages.size === 0) break;
                
                const messagesArray = Array.from(messages.values());
                allMessages.push(...messagesArray);
                lastMessageId = messagesArray[messagesArray.length - 1].id;
                
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            return this.processMessages(allMessages);
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
        
        const sortedMessages = messages.sort((a, b) => a.createdAt - b.createdAt);
        
        sortedMessages.forEach(message => {
            if (!bonusData.dateRange.oldest || message.createdAt < bonusData.dateRange.oldest) {
                bonusData.dateRange.oldest = message.createdAt;
            }
            if (!bonusData.dateRange.newest || message.createdAt > bonusData.dateRange.newest) {
                bonusData.dateRange.newest = message.createdAt;
            }
            
            if (message.webhookId && this.messageParser.isWebhookLog(message.content)) {
                bonusData.processedMessages++;
                
                const lines = message.content.split('\n');
                lines.forEach(line => {
                    const parsed = this.messageParser.parseLine(line);
                    if (!parsed) return;
                    
                    this.processParsedLine(parsed, bonusData, message.createdAt);
                });
            }
        });
        
        // Calcular bonos totales
        for (const [, employeeData] of bonusData.employeeBonuses) {
            for (const [, weekData] of employeeData.weeks) {
                const bonus = Math.round((weekData.totalPaid * this.bot.bonusPercentage) / 100);
                bonusData.totalBonuses += bonus;
            }
        }
        
        return bonusData;
    }

    processParsedLine(parsed, bonusData, timestamp) {
        const weekKey = this.getWeekKeyFromDate(timestamp);
        
        if (!bonusData.employeeBonuses.has(parsed.dni)) {
            bonusData.employeeBonuses.set(parsed.dni, {
                name: parsed.type === 'service_entry' ? parsed.name : `Empleado ${parsed.dni}`,
                weeks: new Map()
            });
            bonusData.employeesFound++;
        }
        
        const employee = bonusData.employeeBonuses.get(parsed.dni);
        if (!employee.weeks.has(weekKey)) {
            employee.weeks.set(weekKey, { invoices: [], totalPaid: 0 });
        }
        
        const weekData = employee.weeks.get(weekKey);
        
        switch (parsed.type) {
            case 'service_entry':
                if (parsed.name !== `Empleado ${parsed.dni}`) {
                    employee.name = parsed.name;
                }
                break;
                
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
    }

    getWeekKeyFromDate(date) {
        const startOfYear = new Date(date.getFullYear(), 0, 1);
        const dayOfWeek = date.getDay();
        const mondayAdjustment = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const mondayOfThisWeek = new Date(date);
        mondayOfThisWeek.setDate(date.getDate() + mondayAdjustment);
        
        const weekNumber = Math.ceil(((mondayOfThisWeek - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
        return `${date.getFullYear()}-${weekNumber}`;
    }

    createScanEmbed(result, title, additionalFields = []) {
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor('#00ff00')
            .addFields(
                {
                    name: '📊 Mensajes Procesados',
                    value: `${result.totalMessages} mensajes escaneados\n${result.processedMessages} mensajes de webhook procesados`,
                    inline: true
                },
                {
                    name: '👥 Empleados Encontrados',
                    value: `${result.employeesFound} empleados`,
                    inline: true
                },
                {
                    name: '📄 Facturas Procesadas',
                    value: `${result.invoicesProcessed} facturas`,
                    inline: true
                },
                {
                    name: '🎁 Bonos Calculados',
                    value: `$${result.totalBonuses} (${this.bot.bonusPercentage}%)`,
                    inline: true
                },
                ...additionalFields
            )
            .setTimestamp();
        
        return embed;
    }
    async syncScanDataWithMain(bonusData) {
    let syncedCount = 0;
    let invoiceCount = 0;

    for (const [dni, employeeData] of bonusData.employeeBonuses) {
        // Obtener o crear el empleado en la estructura principal
        let employee = this.bot.dataManager.getEmployee(dni);
        if (!employee) {
            employee = this.bot.dataManager.registerEmployee(dni, employeeData.name);
        } else if (employee.name.startsWith('Empleado ') && !employeeData.name.startsWith('Empleado ')) {
            // Actualizar nombre si tenemos uno mejor
            employee.name = employeeData.name;
        }

        // Sincronizar datos semanales
        for (const [weekKey, weekScanData] of employeeData.weeks) {
            const weekData = employee.getWeekData(weekKey);
            
            // Sincronizar facturas
            for (const invoice of weekScanData.invoices) {
                // Verificar si la factura ya existe
                const exists = weekData.invoices.some(existingInvoice =>
                    existingInvoice.amount === invoice.amount &&
                    existingInvoice.status === invoice.status &&
                    Math.abs(existingInvoice.timestamp - invoice.timestamp) < 60000 // 1 minuto de tolerancia
                );
                
                if (!exists) {
                    weekData.invoices.push(invoice);
                    invoiceCount++;
                    
                    // Actualizar total pagado si es una factura pagada
                    if (invoice.status === 'paid') {
                        weekData.totalPaid += invoice.amount;
                    }
                }
            }
            
            syncedCount++;
        }
    }

    console.log(`🔄 Sincronizados: ${syncedCount} semanas, ${invoiceCount} facturas`);
    return { syncedWeeks: syncedCount, syncedInvoices: invoiceCount };
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

async repairEmployees() {
    let repairedCount = 0;
    
    for (const [dni, employee] of this.bot.employees) {
        if (typeof employee.getWeekData !== 'function') {
            // Convertir objeto plano a instancia de Employee
            const Employee = require('../models/Employee');
            const WeeklyData = require('../models/WeeklyData');
            
            const newEmployee = new Employee(dni, employee.name || `Empleado ${dni}`);
            
            if (employee.weeklyData) {
                for (const [weekKey, weekData] of Object.entries(employee.weeklyData)) {
                    const weeklyData = new WeeklyData();
                    weeklyData.invoices = weekData.invoices || [];
                    weeklyData.totalPaid = weekData.totalPaid || 0;
                    newEmployee.weeklyData.set(weekKey, weeklyData);
                }
            }
            
            this.bot.employees.set(dni, newEmployee);
            repairedCount++;
        }
    }
    
    return repairedCount;
}
}

module.exports = ChannelScanner;