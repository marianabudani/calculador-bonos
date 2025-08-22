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
            serviceEntry: /^\*\*\[([A-Z]{3}\d+)\]\s+([^*]+)\*\*\s+ha entrado en servicio/,
            invoiceSent: /^\*\*\[([A-Z]{3}\d+)\]\*\*\s+ha enviado una factura\s+`\$(\d+)\s+\(([^)]+)\)`/,
            invoicePaid: /^\*\*[^*]+\*\*\s+ha pagado una factura\s+`\$(\d+)\s+\(([^)]+)\)`\s+de\s+\*\*\[([A-Z]{3}\d+)\]\**/
        };

        // Actualizar semana actual si cambió
        this.currentWeek = this.getCurrentWeekKey();

        const serviceMatch = line.match(patterns.serviceEntry);
        if (serviceMatch) {
            const [, dni, name] = serviceMatch;
            this.registerEmployee(dni, name.trim());
            return;
        }

        const invoiceMatch = line.match(patterns.invoiceSent);
        if (invoiceMatch) {
            const [, dni, amount] = invoiceMatch;
            this.addInvoice(dni, parseInt(amount), 'sent');
            return;
        }

        const paidMatch = line.match(patterns.invoicePaid);
        if (paidMatch) {
            const [, amount, description, dni] = paidMatch;
            this.markInvoiceAsPaid(dni, parseInt(amount));
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
        if (!this.employees.has(dni)) return;
        
        const weekData = this.getEmployeeWeekData(dni, this.currentWeek);
        
        const pendingInvoice = weekData.invoices.find(inv => 
            inv.amount === amount && inv.status === 'sent'
        );
        
        if (pendingInvoice) {
            pendingInvoice.status = 'paid';
            weekData.totalPaid += amount;
            
            const employee = this.employees.get(dni);
            console.log(`Factura pagada (Semana ${this.currentWeek}): ${employee.name} - $${amount}`);
        }
    }

    async handleCommand(message) {
        const args = message.content.slice(1).trim().split(/ +/);
        const command = args[0].toLowerCase();

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
                { name: '!ayuda', value: 'Muestra esta ayuda', inline: false }
            )
            .setFooter({ text: 'Sistema de bonos semanales (Lunes a Domingo)' });

        message.reply({ embeds: [embed] });
    }

    async start() {
        await this.client.login(this.token);
    }
}

if (require.main === module) {
    const botConfig = {
        logChannelIds: [process.env.CANAL_WEBHOOD],
        commandChannelIds: [process.env.ID_CANAL_BOT],
        allowAllChannels: true
    };
    const bot = new EmployeeBonusBot(process.env.DISCORD_TOKEN, botConfig);
    bot.start().catch(console.error);
}

module.exports = EmployeeBonusBot;