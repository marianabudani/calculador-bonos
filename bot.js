const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
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
        this.employees = new Map(); // DNI -> { name, weeklyData: Map<weekKey, salesData> }
        this.bonusPercentage = 10;
        this.currentWeek = this.getCurrentWeekKey();
        
        // Configuración de canales
        this.config = {
            logChannelIds: config.logChannelIds || [], // IDs de canales donde llegan los logs
            commandChannelIds: config.commandChannelIds || [], // IDs de canales para comandos
            allowAllChannels: config.allowAllChannels || true // Si permite todos los canales
        };
        
        this.setupEventHandlers();
    }

    // Obtiene la clave de la semana actual (Año-Semana, ej: "2025-34")
    getCurrentWeekKey() {
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
        
        // Ajustar para que la semana empiece el lunes
        const dayOfWeek = now.getDay(); // 0 = domingo, 1 = lunes, etc.
        const mondayAdjustment = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const mondayOfThisWeek = new Date(now);
        mondayOfThisWeek.setDate(now.getDate() + mondayAdjustment);
        
        const weekNumber = Math.ceil(((mondayOfThisWeek - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
        return `${now.getFullYear()}-${weekNumber}`;
    }

    // Obtiene el rango de fechas de la semana actual
    getCurrentWeekRange() {
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 = domingo, 1 = lunes, etc.
        const mondayAdjustment = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        
        const monday = new Date(now);
        monday.setDate(now.getDate() + mondayAdjustment);
        monday.setHours(0, 0, 0, 0);
        
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        
        return {
            start: monday,
            end: sunday,
            formatted: `${monday.getDate()}/${monday.getMonth() + 1} - ${sunday.getDate()}/${sunday.getMonth() + 1}`
        };
    }

    setupEventHandlers() {
        this.client.once('clientReady', () => {
            console.log(`Bot conectado como ${this.client.user.tag}`);
            console.log(`Semana actual: ${this.currentWeek}`);
        });

        this.client.on('messageCreate', async (message) => {
            if (message.author.bot && !this.isFromWebhook(message)) return;
            
            const channelId = message.channel.id;
            
            // Procesar logs del webhook
            if (this.isWebhookLog(message.content)) {
                // Solo procesar si está en canal permitido o si permite todos
                if (this.config.allowAllChannels || 
                    this.config.logChannelIds.length === 0 || 
                    this.config.logChannelIds.includes(channelId)) {
                    
                    console.log(`📋 Procesando log del canal: ${message.channel.name}`);
                    await this.processWebhookLog(message.content);
                }
                return;
            }
            
            // Comandos del bot (solo de usuarios, no bots)
            if (!message.author.bot && message.content.startsWith('!')) {
                // Solo procesar comandos si está en canal permitido o si permite todos
                if (this.config.allowAllChannels || 
                    this.config.commandChannelIds.length === 0 || 
                    this.config.commandChannelIds.includes(channelId)) {
                    
                    await this.handleCommand(message);
                }
            }
        });
    }

    // Detecta si el mensaje viene de un webhook
    isFromWebhook(message) {
        return message.webhookId !== null;
    }

    isWebhookLog(content) {
        return content.includes('[UDT') || content.includes('ha enviado una factura') || content.includes('ha pagado una factura');
    }

    async processWebhookLog(logContent) {
        const lines = logContent.split('\n');
        
        for (const line of lines) {
            await this.parseLine(line.trim());
        }
    }

    async parseLine(line) {
        const patterns = {
            // Mejorado para capturar mejor los nombres
            serviceEntry: /^\*\*\[([A-Z]{3}\d+)\]\s+([^*]+?)\*\*\s+ha entrado en servicio/,
            invoiceSent: /^\*\*\[([A-Z]{3}\d+)\]\*\*\s+ha enviado una factura\s+`\$(\d+)\s+\(([^)]+)\)`/,
            invoicePaid: /^\*\*[^*]+\*\*\s+ha pagado una factura\s+`\$(\d+)\s+\(([^)]+)\)`\s+de\s+\*\*\[([A-Z]{3}\d+)\]\**/
        };

        // Actualizar semana actual si cambió
        this.currentWeek = this.getCurrentWeekKey();

        const serviceMatch = line.match(patterns.serviceEntry);
        if (serviceMatch) {
            const [, dni, name] = serviceMatch;
            const cleanName = name.trim().replace(/\*+/g, ''); // Limpiar asteriscos extra
            this.registerEmployee(dni, cleanName);
            console.log(`🔍 Empleado procesado: "${cleanName}" (${dni})`);
            return;
        }

        const invoiceMatch = line.match(patterns.invoiceSent);
        if (invoiceMatch) {
            const [, dni, amount] = invoiceMatch;
            this.addInvoice(dni, parseInt(amount), 'sent');
            console.log(`📄 Factura enviada: ${dni} - ${amount}`);
            return;
        }

        const paidMatch = line.match(patterns.invoicePaid);
        if (paidMatch) {
            const [, amount, description, dni] = paidMatch;
            this.markInvoiceAsPaid(dni, parseInt(amount));
            console.log(`💰 Factura pagada: ${dni} - ${amount}`);
            return;
        }
    }

    registerEmployee(dni, name) {
        if (!this.employees.has(dni)) {
            this.employees.set(dni, {
                name: name,
                weeklyData: new Map() // semanaKey -> { invoices: [], totalPaid: 0 }
            });
            console.log(`Empleado registrado: ${name} (${dni})`);
        }
    }

    getEmployeeWeekData(dni, weekKey) {
        const employee = this.employees.get(dni);
        if (!employee) return null;
        
        if (!employee.weeklyData.has(weekKey)) {
            employee.weeklyData.set(weekKey, {
                invoices: [],
                totalPaid: 0
            });
        }
        
        return employee.weeklyData.get(weekKey);
    }

    addInvoice(dni, amount, status = 'sent') {
        // Si el empleado no existe, crearlo con nombre temporal
        if (!this.employees.has(dni)) {
            this.registerEmployee(dni, `Empleado ${dni}`);
        }
        
        const weekData = this.getEmployeeWeekData(dni, this.currentWeek);
        weekData.invoices.push({
            amount: amount,
            status: status,
            timestamp: new Date()
        });
    }

    markInvoiceAsPaid(dni, amount) {
        if (!this.employees.has(dni)) {
            // Crear empleado si no existe
            this.registerEmployee(dni, `Empleado ${dni}`);
        }
        
        const weekData = this.getEmployeeWeekData(dni, this.currentWeek);
        
        const pendingInvoice = weekData.invoices.find(inv => 
            inv.amount === amount && inv.status === 'sent'
        );
        
        if (pendingInvoice) {
            pendingInvoice.status = 'paid';
            weekData.totalPaid += amount;
            
            const employee = this.employees.get(dni);
            console.log(`Factura pagada (Semana ${this.currentWeek}): ${employee.name} - ${amount}`);
        } else {
            // Si no encuentra la factura pendiente, crear una nueva marcada como pagada
            weekData.invoices.push({
                amount: amount,
                status: 'paid',
                timestamp: new Date()
            });
            weekData.totalPaid += amount;
            
            const employee = this.employees.get(dni);
            console.log(`Factura pagada directa (Semana ${this.currentWeek}): ${employee.name} - ${amount}`);
        }
    }

  async scanChannelHistory(channel, messageCount = 100) {
    try {
        console.log(`🔍 Escaneando ${messageCount} mensajes del canal ${channel.name}...`);
        
        let allMessages = [];
        let lastMessageId = null;
        const maxPerRequest = 100; // Límite máximo de la API de Discord
        
        // Calcular cuántas peticiones necesitamos
        const totalRequests = Math.ceil(messageCount / maxPerRequest);
        
        for (let i = 0; i < totalRequests; i++) {
            // Calcular cuántos mensajes solicitar en esta petición
            const remainingMessages = messageCount - allMessages.length;
            const currentLimit = Math.min(maxPerRequest, remainingMessages);
            
            console.log(`📄 Petición ${i + 1}/${totalRequests} - Solicitando ${currentLimit} mensajes...`);
            
            // Configurar opciones para la petición
            const fetchOptions = { 
                limit: currentLimit 
            };
            
            // Si no es la primera petición, usar el ID del último mensaje como punto de partida
            if (lastMessageId) {
                fetchOptions.before = lastMessageId;
            }
            
            // Hacer la petición
            const messages = await channel.messages.fetch(fetchOptions);
            
            if (messages.size === 0) {
                console.log('🔚 No hay más mensajes disponibles');
                break;
            }
            
            // Convertir a array y agregar a la colección total
            const messagesArray = Array.from(messages.values());
            allMessages.push(...messagesArray);
            
            // Actualizar el ID del último mensaje para la siguiente petición
            lastMessageId = messagesArray[messagesArray.length - 1].id;
            
            console.log(`✅ Obtenidos ${messages.size} mensajes (Total: ${allMessages.length})`);
            
            // Pequeña pausa entre peticiones para evitar rate limiting
            if (i < totalRequests - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        console.log(`📊 Escaneo completado: ${allMessages.length} mensajes obtenidos`);
        
        // Aquí procesas los mensajes como lo hacías antes
        const bonusData = this.processBonusMessages(allMessages);
        
        return {
            totalMessages: allMessages.length,
            bonusData: bonusData
        };
        
    } catch (error) {
        console.error('❌ Error al escanear el canal:', error);
        throw error;
    }
}

// Función mejorada para procesar mensajes de bonos
processBonusMessages(messages) {
    const bonusData = {
        totalBonuses: 0,
        employeeBonuses: new Map(),
        processedMessages: 0,
        employeesFound: 0,
        invoicesProcessed: 0,
        dateRange: {
            oldest: null,
            newest: null
        }
    };
    
    console.log(`🔍 Procesando ${messages.length} mensajes para extraer datos de bonos...`);
    
    // Ordenar mensajes por fecha (más antiguos primero) para procesar en orden cronológico
    const sortedMessages = messages.sort((a, b) => a.createdAt - b.createdAt);
    
    sortedMessages.forEach((message, index) => {
        // Actualizar rango de fechas
        if (!bonusData.dateRange.oldest || message.createdAt < bonusData.dateRange.oldest) {
            bonusData.dateRange.oldest = message.createdAt;
        }
        if (!bonusData.dateRange.newest || message.createdAt > bonusData.dateRange.newest) {
            bonusData.dateRange.newest = message.createdAt;
        }
        
        // Procesar solo mensajes de webhook que contienen logs
        if (message.webhookId && this.isWebhookLog(message.content)) {
            bonusData.processedMessages++;
            
            // Log de progreso cada 100 mensajes
            if (bonusData.processedMessages % 100 === 0) {
                console.log(`📊 Procesados ${bonusData.processedMessages} mensajes de webhook...`);
            }
            
            // Procesar cada línea del mensaje
            const lines = message.content.split('\n');
            
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;
                
                // Patrones mejorados para capturar nombres
                const patterns = {
                    // Patrón más flexible para nombres
                    serviceEntry: /^\*\*\[([A-Z]{3}\d+)\]\s+(.+?)\*\*\s+ha entrado en servicio/,
                    invoiceSent: /^\*\*\[([A-Z]{3}\d+)\]\*\*\s+ha enviado una factura\s+`\$(\d+)\s+\(([^)]+)\)`/,
                    invoicePaid: /^\*\*[^*]+\*\*\s+ha pagado una factura\s+`\$(\d+)\s+\(([^)]+)\)`\s+de\s+\*\*\[([A-Z]{3}\d+)\]\**/
                };
                
                // Obtener la clave de semana del mensaje
                const messageWeek = this.getWeekKeyFromDate(message.createdAt);
                
                // Procesar entrada en servicio (registrar empleado)
                const serviceMatch = trimmedLine.match(patterns.serviceEntry);
                if (serviceMatch) {
                    const [, dni, nameWithAsterisks] = serviceMatch;
                    // Limpiar mejor el nombre
                    const cleanName = nameWithAsterisks
                        .replace(/\*+/g, '') // Quitar asteriscos
                        .trim()
                        .replace(/\s+/g, ' '); // Normalizar espacios
                    
                    console.log(`👤 Empleado encontrado: "${cleanName}" (${dni}) en línea: "${trimmedLine}"`);
                    
                    // Registrar tanto en datos del escaneo como en estructura principal
                    if (!bonusData.employeeBonuses.has(dni)) {
                        bonusData.employeeBonuses.set(dni, {
                            name: cleanName,
                            weeks: new Map()
                        });
                        bonusData.employeesFound++;
                    } else {
                        // Actualizar el nombre si es mejor que el actual
                        const existing = bonusData.employeeBonuses.get(dni);
                        if (cleanName.length > existing.name.length && !cleanName.includes('Empleado')) {
                            existing.name = cleanName;
                        }
                    }
                    
                    // También registrar en la estructura principal del bot
                    this.registerEmployee(dni, cleanName);
                    continue;
                }
                
                // Procesar factura enviada
                const invoiceMatch = trimmedLine.match(patterns.invoiceSent);
                if (invoiceMatch) {
                    const [, dni, amount] = invoiceMatch;
                    this.addInvoiceToScanData(bonusData, dni, parseInt(amount), 'sent', messageWeek, message.createdAt);
                    
                    // También agregar a la estructura principal
                    this.addInvoiceToMainData(dni, parseInt(amount), 'sent', messageWeek, message.createdAt);
                    
                    bonusData.invoicesProcessed++;
                    continue;
                }
                
                // Procesar factura pagada
                const paidMatch = trimmedLine.match(patterns.invoicePaid);
                if (paidMatch) {
                    const [, amount, description, dni] = paidMatch;
                    this.addInvoiceToScanData(bonusData, dni, parseInt(amount), 'paid', messageWeek, message.createdAt);
                    
                    // También agregar a la estructura principal
                    this.addInvoiceToMainData(dni, parseInt(amount), 'paid', messageWeek, message.createdAt);
                    
                    bonusData.invoicesProcessed++;
                    continue;
                }
            }
        }
    });
    
    // Calcular bonos totales
    for (const [dni, employeeData] of bonusData.employeeBonuses) {
        for (const [week, weekData] of employeeData.weeks) {
            const bonus = Math.round((weekData.totalPaid * this.bonusPercentage) / 100);
            bonusData.totalBonuses += bonus;
        }
    }
    
    console.log(`📊 Procesamiento completado: ${bonusData.processedMessages} mensajes de webhook, ${bonusData.employeesFound} empleados, ${bonusData.invoicesProcessed} facturas`);
    
    return bonusData;
}

// Nueva función para agregar facturas a la estructura principal
addInvoiceToMainData(dni, amount, status, weekKey, timestamp) {
    // Asegurar que el empleado existe
    if (!this.employees.has(dni)) {
        this.registerEmployee(dni, `Empleado ${dni}`);
    }
    
    // Obtener datos de la semana
    const weekData = this.getEmployeeWeekData(dni, weekKey);
    
    if (status === 'sent') {
        // Verificar si ya existe esta factura para evitar duplicados
        const existingInvoice = weekData.invoices.find(inv => 
            inv.amount === amount && inv.timestamp && 
            Math.abs(inv.timestamp.getTime() - timestamp.getTime()) < 60000 // 1 minuto de diferencia
        );
        
        if (!existingInvoice) {
            weekData.invoices.push({
                amount: amount,
                status: 'sent',
                timestamp: timestamp
            });
        }
    } else if (status === 'paid') {
        // Buscar factura pendiente para marcar como pagada
        const pendingInvoice = weekData.invoices.find(inv => 
            inv.amount === amount && inv.status === 'sent'
        );
        
        if (pendingInvoice) {
            pendingInvoice.status = 'paid';
        } else {
            // Crear factura directamente pagada si no se encuentra pendiente
            weekData.invoices.push({
                amount: amount,
                status: 'paid',
                timestamp: timestamp
            });
        }
        
        // Actualizar total pagado
        weekData.totalPaid += amount;
    }
}

// Función mejorada para escanear con más profundidad
async scanChannelHistory(channel, messageCount = 100) {
    try {
        console.log(`🔍 Escaneando ${messageCount} mensajes del canal ${channel.name}...`);
        console.log(`📅 Intentando obtener mensajes desde el ${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES')} hasta hoy`);
        
        let allMessages = [];
        let lastMessageId = null;
        const maxPerRequest = 100;
        
        const totalRequests = Math.ceil(messageCount / maxPerRequest);
        
        for (let i = 0; i < totalRequests; i++) {
            const remainingMessages = messageCount - allMessages.length;
            const currentLimit = Math.min(maxPerRequest, remainingMessages);
            
            console.log(`📄 Petición ${i + 1}/${totalRequests} - Solicitando ${currentLimit} mensajes...`);
            
            const fetchOptions = { 
                limit: currentLimit 
            };
            
            if (lastMessageId) {
                fetchOptions.before = lastMessageId;
            }
            
            try {
                const messages = await channel.messages.fetch(fetchOptions);
                
                if (messages.size === 0) {
                    console.log('🔚 No hay más mensajes disponibles');
                    break;
                }
                
                const messagesArray = Array.from(messages.values());
                allMessages.push(...messagesArray);
                
                lastMessageId = messagesArray[messagesArray.length - 1].id;
                
                // Mostrar fecha del mensaje más antiguo obtenido
                const oldestMessage = messagesArray[messagesArray.length - 1];
                console.log(`✅ Obtenidos ${messages.size} mensajes (Total: ${allMessages.length}) - Más antiguo: ${oldestMessage.createdAt.toLocaleDateString('es-ES')}`);
                
                // Pausa más larga para evitar rate limits
                if (i < totalRequests - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (fetchError) {
                console.error(`❌ Error en petición ${i + 1}:`, fetchError.message);
                break;
            }
        }
        
        console.log(`📊 Escaneo completado: ${allMessages.length} mensajes obtenidos`);
        
        if (allMessages.length > 0) {
            const oldestMsg = allMessages[allMessages.length - 1];
            const newestMsg = allMessages[0];
            console.log(`📅 Rango: ${oldestMsg.createdAt.toLocaleDateString('es-ES')} a ${newestMsg.createdAt.toLocaleDateString('es-ES')}`);
        }
        
        // Procesar mensajes
        const bonusData = this.processBonusMessages(allMessages);
        
        return {
            totalMessages: allMessages.length,
            bonusData: bonusData
        };
        
    } catch (error) {
        console.error('❌ Error al escanear el canal:', error);
        throw error;
    }
}

// Función auxiliar para obtener clave de semana desde una fecha
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

// Función auxiliar para agregar facturas a los datos del escaneo
addInvoiceToScanData(bonusData, dni, amount, status, weekKey, timestamp) {
    // Crear empleado si no existe
    if (!bonusData.employeeBonuses.has(dni)) {
        bonusData.employeeBonuses.set(dni, {
            name: `Empleado ${dni}`,
            weeks: new Map()
        });
        bonusData.employeesFound++;
    }
    
    const employee = bonusData.employeeBonuses.get(dni);
    
    // Crear datos de semana si no existen
    if (!employee.weeks.has(weekKey)) {
        employee.weeks.set(weekKey, {
            invoices: [],
            totalPaid: 0
        });
    }
    
    const weekData = employee.weeks.get(weekKey);
    
    if (status === 'sent') {
        // Agregar factura enviada
        weekData.invoices.push({
            amount: amount,
            status: 'sent',
            timestamp: timestamp
        });
    } else if (status === 'paid') {
        // Buscar factura pendiente para marcar como pagada
        const pendingInvoice = weekData.invoices.find(inv => 
            inv.amount === amount && inv.status === 'sent'
        );
        
        if (pendingInvoice) {
            pendingInvoice.status = 'paid';
        } else {
            // Crear factura directamente pagada
            weekData.invoices.push({
                amount: amount,
                status: 'paid',
                timestamp: timestamp
            });
        }
        
        weekData.totalPaid += amount;
    }
}

    // Funciones auxiliares para el escaneo
    getTotalInvoices() {
        let total = 0;
        for (const [dni, employee] of this.employees) {
            for (const weekData of employee.weeklyData.values()) {
                total += weekData.invoices.length;
            }
        }
        return total;
    }

    getTotalPaidInvoices() {
        let total = 0;
        for (const [dni, employee] of this.employees) {
            for (const weekData of employee.weeklyData.values()) {
                total += weekData.invoices.filter(inv => inv.status === 'paid').length;
            }
        }
        return total;
    }

async handleCommand(message) {
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args[0].toLowerCase();
    
    try {
        console.log(`🤖 Procesando comando: ${command} con args:`, args);
        
        switch (command) {
            case 'bonos':
                await this.calculateWeeklyBonuses(message);
                break;
                
            case 'bonossemana':
                await this.calculateSpecificWeekBonuses(message, args[1]);
                break;
                
            case 'cerrarsemana':
                await this.closeWeek(message);
                break;
                
            case 'historial':
                await this.showWeeklyHistory(message, args[1]);
                break;
                
            case 'setbono':
                await this.setBonusPercentage(message, args[1]);
                break;
                
            case 'empleados':
                await this.showEmployees(message);
                break;
                
            case 'reset':
                await this.resetData(message);
                break;
                
            case 'config':
                await this.showConfig(message);
                break;
                
            case 'setchannel':
                await this.setChannelConfig(message, args);
                break;
                
            case 'semana':
                await this.showCurrentWeek(message);
                break;
                
            case 'help':
            case 'ayuda':
                await this.showHelp(message);
                break;
                
            case 'scanfecha':
            try {
                const fechaInicioStr = args[1]; // formato DD/MM/YYYY
                const fechaFinStr = args[2];
                
                if (!fechaInicioStr || !fechaFinStr) {
                    return message.reply('❌ Uso: `!scanfecha DD/MM/AAAA DD/MM/AAAA`\nEjemplo: `!scanfecha 20/08/2025 23/08/2025`');
                }
                // Parsear fechas
                const [diaInicio, mesInicio, añoInicio] = fechaInicioStr.split('/').map(Number);
                const [diaFin, mesFin, añoFin] = fechaFinStr.split('/').map(Number);
                
                if (isNaN(diaInicio) || isNaN(mesInicio) || isNaN(añoInicio) || 
                    isNaN(diaFin) || isNaN(mesFin) || isNaN(añoFin)) {
                    return message.reply('❌ Formato de fecha inválido. Usa DD/MM/AAAA');
                }
                
                const fechaInicio = new Date(añoInicio, mesInicio - 1, diaInicio, 0, 0, 0);
                const fechaFin = new Date(añoFin, mesFin - 1, diaFin, 23, 59, 59);
                
                if (fechaInicio > fechaFin) {
                    return message.reply('❌ La fecha de inicio no puede ser mayor que la fecha de fin');
                }
                
                // Obtener el canal del webhook desde el .env
                const webhookChannelId = process.env.CANAL_WEBHOOK;
                
                if (!webhookChannelId) {
                    return message.reply('❌ No se ha configurado CANAL_WEBHOOK en el archivo .env');
                }

                let targetChannel;
                try {
                    targetChannel = await message.guild.channels.fetch(webhookChannelId);
                } catch (error) {
                    return message.reply(`❌ No se pudo encontrar el canal con ID: ${webhookChannelId}`);
                }

                if (!targetChannel) {
                    return message.reply('❌ No se pudo determinar el canal a escanear');
                }

                // Verificar permisos
                const botPermissions = targetChannel.permissionsFor(message.guild.members.me);
                if (!botPermissions || !botPermissions.has(['ViewChannel', 'ReadMessageHistory'])) {
                    return message.reply('❌ No tengo permisos para leer el historial de ese canal');
                }
                
                console.log(`🎯 Escaneando por fecha: ${fechaInicio.toLocaleDateString('es-ES')} a ${fechaFin.toLocaleDateString('es-ES')}`);
                
                const startMsg = await message.reply(`🔄 Iniciando escaneo desde ${fechaInicioStr} hasta ${fechaFinStr} en ${targetChannel.name}...`);
                
                try {
                    const result = await this.scanChannelByDate(targetChannel, fechaInicio, fechaFin);
                    
                    // Crear embed con resultados
                    const embed = new EmbedBuilder()
                        .setTitle('✅ Escaneo por Fechas Completado')
                        .setColor('#00ff00')
                        .addFields(
                            {
                                name: '📅 Rango de Fechas',
                                value: `${fechaInicio.toLocaleDateString('es-ES')} - ${fechaFin.toLocaleDateString('es-ES')}`,
                                inline: true
                            },
                            {
                                name: '📊 Mensajes Procesados',
                                value: `${result.totalMessages} mensajes escaneados\n${result.bonusData.processedMessages} mensajes de webhook procesados`,
                                inline: true
                            },
                            {
                                name: '👥 Empleados Encontrados',
                                value: `${result.bonusData.employeesFound} empleados`,
                                inline: true
                            },
                            {
                                name: '📄 Facturas Procesadas',
                                value: `${result.bonusData.invoicesProcessed} facturas`,
                                inline: true
                            },
                            {
                                name: '🎁 Bonos Calculados',
                                value: `$${result.bonusData.totalBonuses} (${this.bonusPercentage}%)`,
                                inline: true
                            }
                        )
                        .setTimestamp()
                        .setFooter({ text: `Canal: ${targetChannel.name}` });

                    // Agregar información de empleados si hay pocos
                    if (result.bonusData.employeeBonuses.size > 0 && result.bonusData.employeeBonuses.size <= 10) {
                        let employeeList = '';
                        for (const [dni, employeeData] of result.bonusData.employeeBonuses) {
                            let totalPaid = 0;
                            for (const weekData of employeeData.weeks.values()) {
                                totalPaid += weekData.totalPaid;
                            }
                            const bonus = Math.round((totalPaid * this.bonusPercentage) / 100);
                            employeeList += `**${employeeData.name}** (${dni})\n💰 $${totalPaid} → 🎁 $${bonus}\n\n`;
                        }
                        
                        if (employeeList.length < 1024) {
                            embed.addFields({
                                name: '👤 Detalle por Empleado',
                                value: employeeList.slice(0, 1020) + (employeeList.length > 1020 ? '...' : ''),
                                inline: false
                            });
                        }
                    }
                    
                    // Guardar datos automáticamente después del escaneo
                    if (typeof this.saveDataToFile === 'function') {
                        await this.saveDataToFile();
                        console.log('💾 Datos guardados automáticamente');
                    }
                    
                    await startMsg.edit({ content: '', embeds: [embed] });
                    
                } catch (error) {
                    console.error('❌ Error durante el escaneo por fechas:', error);
                    await startMsg.edit(`❌ Error durante el escaneo: ${error.message}`);
                }
            } catch (error) {
                console.error('❌ Error en comando scanfecha:', error);
                await message.reply(`❌ Error al procesar el comando: ${error.message}`);
            }
            break;
            case 'scan':
            case 'escanear':
                // Obtener el canal del webhook desde el .env
                const webhookChannelId = process.env.CANAL_WEBHOOK;
                
                if (!webhookChannelId) {
                    return message.reply('❌ No se ha configurado CANAL_WEBHOOK en el archivo .env');
                }

                let targetChannel;
                try {
                    // Obtener el objeto canal real usando el ID
                    targetChannel = await message.guild.channels.fetch(webhookChannelId);
                } catch (error) {
                    return message.reply(`❌ No se pudo encontrar el canal con ID: ${webhookChannelId}`);
                }

                if (!targetChannel) {
                    return message.reply('❌ No se pudo determinar el canal a escanear');
                }

                // Verificar permisos
                const botPermissions = targetChannel.permissionsFor(message.guild.members.me);
                if (!botPermissions || !botPermissions.has(['ViewChannel', 'ReadMessageHistory'])) {
                    return message.reply('❌ No tengo permisos para leer el historial de ese canal');
                }
                
                console.log(`🎯 Canal objetivo: ${targetChannel.name} (${targetChannel.id})`);
                const messageCount = parseInt(args[1]) || 100;
                if (messageCount > 1000) {
                    return message.reply('❌ No puedo escanear más de 1000 mensajes por vez');
                }
                
                const startMsg = await message.reply(`🔄 Iniciando escaneo de ${messageCount} mensajes en ${targetChannel.name}...`);
                
                try {
                    const result = await this.scanChannelHistory(targetChannel, messageCount);
                    
                    // Crear embed con resultados detallados
                    const embed = new EmbedBuilder()
                        .setTitle('✅ Escaneo de Canal Completado')
                        .setColor('#00ff00')
                        .addFields(
                            {
                                name: '📊 Mensajes Procesados',
                                value: `${result.totalMessages} mensajes escaneados\n${result.bonusData.processedMessages} mensajes de webhook procesados`,
                                inline: true
                            },
                            {
                                name: '👥 Empleados Encontrados',
                                value: `${result.bonusData.employeesFound} empleados`,
                                inline: true
                            },
                            {
                                name: '📄 Facturas Procesadas',
                                value: `${result.bonusData.invoicesProcessed} facturas`,
                                inline: true
                            },
                            {
                                name: '🎁 Bonos Calculados',
                                value: `$${result.bonusData.totalBonuses} (${this.bonusPercentage}%)`,
                                inline: true
                            },
                            {
                                name: '📅 Rango de Fechas',
                                value: result.bonusData.dateRange.oldest && result.bonusData.dateRange.newest ?
                                    `${result.bonusData.dateRange.oldest.toLocaleDateString('es-ES')} - ${result.bonusData.dateRange.newest.toLocaleDateString('es-ES')}` :
                                    'Sin datos de fecha',
                                inline: true
                            }
                        )
                        .setTimestamp()
                        .setFooter({ text: `Canal: ${targetChannel.name}` });

                    // Agregar información de empleados si hay pocos
                    if (result.bonusData.employeeBonuses.size > 0 && result.bonusData.employeeBonuses.size <= 10) {
                        let employeeList = '';
                        for (const [dni, employeeData] of result.bonusData.employeeBonuses) {
                            let totalPaid = 0;
                            for (const weekData of employeeData.weeks.values()) {
                                totalPaid += weekData.totalPaid;
                            }
                            const bonus = Math.round((totalPaid * this.bonusPercentage) / 100);
                            employeeList += `**${employeeData.name}** (${dni})\n💰 $${totalPaid} → 🎁 $${bonus}\n\n`;
                        }
                        
                        if (employeeList.length < 1024) { // Límite de campo de Discord
                            embed.addFields({
                                name: '👤 Detalle por Empleado',
                                value: employeeList.slice(0, 1020) + (employeeList.length > 1020 ? '...' : ''),
                                inline: false
                            });
                        }
                    }
                    
                    // Guardar datos automáticamente después del escaneo
                    if (typeof this.saveDataToFile === 'function') {
                        await this.saveDataToFile();
                        console.log('💾 Datos guardados automáticamente');
                    }
                    
                    await startMsg.edit({ content: '', embeds: [embed] });
                    
                } catch (error) {
                    console.error('❌ Error durante el escaneo:', error);
                    await startMsg.edit(`❌ Error durante el escaneo: ${error.message}`);
                }
                break;
                
            default:
                await message.reply('❓ Comando no reconocido');
        }
        
    } catch (error) {
        console.error('❌ Error en handleCommand:', error);
        await message.reply(`❌ Error al procesar el comando: ${error.message}`);
    }
}
    async saveDataToFile() {
        try {
            const data = {
                employees: Object.fromEntries(this.employees),
                bonusPercentage: this.bonusPercentage,
                currentWeek: this.currentWeek,
                savedAt: new Date().toISOString()
            };
            
            await fs.writeFile('./bot_data.json', JSON.stringify(data, null, 2));
            console.log('💾 Datos guardados en bot_data.json');
        } catch (error) {
            console.error('❌ Error al guardar datos:', error);
        }
    }
    async calculateWeeklyBonuses(message) {
        await this.calculateSpecificWeekBonuses(message, this.currentWeek);
    }

    async calculateSpecificWeekBonuses(message, weekKey = null) {
        const targetWeek = weekKey || this.currentWeek;
        
        if (this.employees.size === 0) {
            message.reply('No hay empleados registrados aún.');
            return;
        }

        const weekRange = this.getCurrentWeekRange();
        const isCurrentWeek = targetWeek === this.currentWeek;

        const embed = new EmbedBuilder()
            .setTitle(`🏆 Bonos - Semana ${targetWeek}`)
            .setColor(isCurrentWeek ? '#00ff00' : '#0099ff')
            .setTimestamp()
            .addFields(
                {
                    name: 'Período',
                    value: isCurrentWeek ? `${weekRange.formatted} (Semana actual)` : `Semana ${targetWeek}`,
                    inline: true
                },
                {
                    name: 'Porcentaje de Bono',
                    value: `${this.bonusPercentage}%`,
                    inline: true
                }
            );

        let totalBonuses = 0;
        let employeeCount = 0;

        for (const [dni, employee] of this.employees) {
            const weekData = employee.weeklyData.get(targetWeek);
            
            if (weekData && weekData.totalPaid > 0) {
                const bonus = Math.round((weekData.totalPaid * this.bonusPercentage) / 100);
                const paidInvoices = weekData.invoices.filter(inv => inv.status === 'paid').length;
                
                embed.addFields({
                    name: `${employee.name} (${dni})`,
                    value: `💰 Ventas: $${weekData.totalPaid}\n🎁 Bono: $${bonus}\n📋 Facturas: ${paidInvoices}`,
                    inline: true
                });
                
                totalBonuses += bonus;
                employeeCount++;
            }
        }

        if (employeeCount === 0) {
            embed.addFields({
                name: 'Sin ventas',
                value: `No hay facturas pagadas registradas para la semana ${targetWeek}.`,
                inline: false
            });
        } else {
            embed.addFields({
                name: '📊 Resumen Semanal',
                value: `Empleados con ventas: ${employeeCount}\nTotal bonos: $${totalBonuses}`,
                inline: false
            });
        }

        message.reply({ embeds: [embed] });
    }

    async closeWeek(message) {
        const weekRange = this.getCurrentWeekRange();
        
        // Mostrar resumen final de la semana antes de cerrarla
        await this.calculateWeeklyBonuses(message);
        
        // Mensaje de confirmación
        const confirmEmbed = new EmbedBuilder()
            .setTitle('📅 Semana Cerrada')
            .setColor('#ff9900')
            .addFields(
                {
                    name: 'Semana cerrada',
                    value: `${this.currentWeek} (${weekRange.formatted})`,
                    inline: false
                },
                {
                    name: 'Nueva semana',
                    value: 'Los próximos registros se contarán para la nueva semana.',
                    inline: false
                }
            )
            .setTimestamp();

        message.reply({ embeds: [confirmEmbed] });
    }

    async showWeeklyHistory(message, employeeDni = null) {
        if (this.employees.size === 0) {
            message.reply('No hay empleados registrados.');
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('📈 Historial de Ventas por Semana')
            .setColor('#9900ff')
            .setTimestamp();

        if (employeeDni) {
            // Mostrar historial de un empleado específico
            const employee = this.employees.get(employeeDni.toUpperCase());
            if (!employee) {
                message.reply(`No se encontró el empleado con DNI: ${employeeDni}`);
                return;
            }

            embed.setTitle(`📈 Historial - ${employee.name} (${employeeDni.toUpperCase()})`);
            
            const sortedWeeks = Array.from(employee.weeklyData.keys()).sort().reverse();
            
            for (const week of sortedWeeks.slice(0, 8)) { // Últimas 8 semanas
                const data = employee.weeklyData.get(week);
                const bonus = Math.round((data.totalPaid * this.bonusPercentage) / 100);
                const isCurrentWeek = week === this.currentWeek;
                
                embed.addFields({
                    name: `Semana ${week} ${isCurrentWeek ? '(Actual)' : ''}`,
                    value: `💰 $${data.totalPaid} → 🎁 $${bonus}`,
                    inline: true
                });
            }
        } else {
            // Mostrar resumen de todas las semanas
            const allWeeks = new Set();
            
            for (const [dni, employee] of this.employees) {
                for (const week of employee.weeklyData.keys()) {
                    allWeeks.add(week);
                }
            }
            
            const sortedWeeks = Array.from(allWeeks).sort().reverse();
            
            for (const week of sortedWeeks.slice(0, 4)) { // Últimas 4 semanas
                let weekTotal = 0;
                let employeesWithSales = 0;
                
                for (const [dni, employee] of this.employees) {
                    const weekData = employee.weeklyData.get(week);
                    if (weekData && weekData.totalPaid > 0) {
                        weekTotal += weekData.totalPaid;
                        employeesWithSales++;
                    }
                }
                
                if (weekTotal > 0) {
                    const totalBonuses = Math.round((weekTotal * this.bonusPercentage) / 100);
                    const isCurrentWeek = week === this.currentWeek;
                    
                    embed.addFields({
                        name: `Semana ${week} ${isCurrentWeek ? '(Actual)' : ''}`,
                        value: `💰 Total: $${weekTotal}\n👥 Empleados: ${employeesWithSales}\n🎁 Bonos: $${totalBonuses}`,
                        inline: true
                    });
                }
            }
        }

        message.reply({ embeds: [embed] });
    }

    async showConfig(message) {
        const embed = new EmbedBuilder()
            .setTitle('⚙️ Configuración del Bot')
            .setColor('#ff6600')
            .addFields(
                {
                    name: 'Canales de Logs',
                    value: this.config.logChannelIds.length > 0 ? 
                        this.config.logChannelIds.map(id => `<#${id}>`).join(', ') : 
                        'Todos los canales permitidos',
                    inline: false
                },
                {
                    name: 'Canales de Comandos',
                    value: this.config.commandChannelIds.length > 0 ? 
                        this.config.commandChannelIds.map(id => `<#${id}>`).join(', ') : 
                        'Todos los canales permitidos',
                    inline: false
                },
                {
                    name: 'Canal Actual',
                    value: `<#${message.channel.id}> (${message.channel.id})`,
                    inline: false
                }
            )
            .setFooter({ text: 'Usa !setchannel para configurar canales específicos' });

        message.reply({ embeds: [embed] });
    }

    async setChannelConfig(message, args) {
        if (args.length < 3) {
            message.reply('❌ Uso: `!setchannel [logs/comandos/reset] [ID_del_canal]`\n\nEjemplos:\n`!setchannel logs 123456789`\n`!setchannel comandos 987654321`\n`!setchannel reset`');
            return;
        }

        const type = args[1].toLowerCase();
        const channelId = args[2];

        if (type === 'reset') {
            this.config.logChannelIds = [];
            this.config.commandChannelIds = [];
            this.config.allowAllChannels = true;
            message.reply('✅ Configuración reseteada. El bot funcionará en todos los canales.');
            return;
        }

        if (type === 'logs') {
            if (!this.config.logChannelIds.includes(channelId)) {
                this.config.logChannelIds.push(channelId);
                this.config.allowAllChannels = false;
            }
            message.reply(`✅ Canal <#${channelId}> agregado para procesar logs del webhook.`);
            
        } else if (type === 'comandos') {
            if (!this.config.commandChannelIds.includes(channelId)) {
                this.config.commandChannelIds.push(channelId);
                this.config.allowAllChannels = false;
            }
            message.reply(`✅ Canal <#${channelId}> agregado para comandos del bot.`);
            
        } else {
            message.reply('❌ Tipo inválido. Usa: `logs`, `comandos` o `reset`');
        }
    }

    async showCurrentWeek(message) {
        const weekRange = this.getCurrentWeekRange();
        
        const embed = new EmbedBuilder()
            .setTitle('📅 Información de Semana Actual')
            .setColor('#00ffff')
            .addFields(
                {
                    name: 'Semana',
                    value: this.currentWeek,
                    inline: true
                },
                {
                    name: 'Período',
                    value: weekRange.formatted,
                    inline: true
                },
                {
                    name: 'Fecha actual',
                    value: new Date().toLocaleDateString('es-ES'),
                    inline: true
                }
            )
            .setTimestamp();

        message.reply({ embeds: [embed] });
    }

    async setBonusPercentage(message, newPercentage) {
        const percentage = parseInt(newPercentage);
        
        if (isNaN(percentage) || percentage < 0 || percentage > 100) {
            message.reply('❌ Porcentaje inválido. Usa un número entre 0 y 100.');
            return;
        }

        this.bonusPercentage = percentage;
        message.reply(`✅ Porcentaje de bono actualizado a ${percentage}%`);
    }

    async showEmployees(message) {
        if (this.employees.size === 0) {
            message.reply('No hay empleados registrados.');
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('👥 Empleados - Semana Actual')
            .setColor('#0099ff')
            .setTimestamp();

        for (const [dni, employee] of this.employees) {
            const currentWeekData = employee.weeklyData.get(this.currentWeek);
            const totalPaid = currentWeekData ? currentWeekData.totalPaid : 0;
            const paidInvoices = currentWeekData ? currentWeekData.invoices.filter(inv => inv.status === 'paid').length : 0;
            const pendingInvoices = currentWeekData ? currentWeekData.invoices.filter(inv => inv.status === 'sent').length : 0;
            
            // Calcular total histórico
            let historicTotal = 0;
            for (const weekData of employee.weeklyData.values()) {
                historicTotal += weekData.totalPaid;
            }
            
            embed.addFields({
                name: `${employee.name} (${dni})`,
                value: `📅 Esta semana: $${totalPaid}\n📈 Histórico: $${historicTotal}\n✅ Pagadas: ${paidInvoices} | ⏳ Pendientes: ${pendingInvoices}`,
                inline: true
            });
        }

        message.reply({ embeds: [embed] });
    }

    async resetData(message) {
        this.employees.clear();
        message.reply('🗑️ Todos los datos han sido eliminados.');
    }

    async showHelp(message) {
        const embed = new EmbedBuilder()
            .setTitle('📖 Comandos del Bot de Bonos Semanales')
            .setColor('#ff9900')
            .addFields(
                { name: '!bonos', value: 'Calcula bonos de la semana actual', inline: false },
                { name: '!bonossemana [2025-34]', value: 'Calcula bonos de una semana específica', inline: false },
                { name: '!cerrarsemana', value: 'Muestra resumen final y "cierra" la semana actual', inline: false },
                { name: '!historial [DNI]', value: 'Muestra historial de semanas (general o de un empleado)', inline: false },
                { name: '!semana', value: 'Información de la semana actual', inline: false },
                { name: '!empleados', value: 'Lista empleados con datos de semana actual', inline: false },
                { name: '!setbono [%]', value: 'Establece porcentaje de bono (ej: !setbono 25)', inline: false },
                { name: '!reset', value: 'Elimina todos los datos', inline: false },
                { name: '!config', value: 'Muestra la configuración actual de canales', inline: false },
                { name: '!setchannel', value: 'Configura canales específicos para logs o comandos', inline: false },
                { name: '!scan [número]', value: 'Escanea mensajes anteriores del canal (ej: !scan 500)', inline: false },
                { name: '!ayuda', value: 'Muestra esta ayuda', inline: false }
            )
            .setFooter({ text: 'Sistema de bonos semanales (Lunes a Domingo)' });

        message.reply({ embeds: [embed] });
    }

    async start() {
        await this.client.login(this.token);
    }
}

// Uso del bot
// IMPORTANTE: Cambia este token por tu token real
if (require.main === module) {
    const botConfig = {
        logChannelIds: [process.env.CANAL_WEBHOOK],
        commandChannelIds: [process.env.ID_CANAL_BOT],
        allowAllChannels: true
    };
    
    const bot = new EmployeeBonusBot(process.env.DISCORD_TOKEN, botConfig);
    bot.start().catch(console.error);
}

module.exports = EmployeeBonusBot;