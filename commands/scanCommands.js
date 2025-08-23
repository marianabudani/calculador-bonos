const { EmbedBuilder } = require('discord.js');

class ScanCommands {
    constructor(bot) {
        this.bot = bot;
        this.channelScanner = bot.channelScanner;
    }

    async handleScanFecha(message, args) {
        try {
            const fechaInicioStr = args[1];
            const fechaFinStr = args[2];
            
            if (!fechaInicioStr || !fechaFinStr) {
                return message.reply('❌ Uso: `!scanfecha DD/MM/AAAA DD/MM/AAAA`\nEjemplo: `!scanfecha 20/08/2025 23/08/2025`');
            }
            
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
            
            const webhookChannelId = process.env.CANAL_WEBHOOK;
            if (!webhookChannelId) {
                return message.reply('❌ No se ha configurado CANAL_WEBHOOK en el archivo .env');
            }

            const targetChannel = await message.guild.channels.fetch(webhookChannelId);
            if (!targetChannel) {
                return message.reply('❌ No se pudo encontrar el canal de webhook');
            }

            const botPermissions = targetChannel.permissionsFor(message.guild.members.me);
            if (!botPermissions?.has(['ViewChannel', 'ReadMessageHistory'])) {
                return message.reply('❌ No tengo permisos para leer el historial de ese canal');
            }
            
            const startMsg = await message.reply(`🔄 Iniciando escaneo desde ${fechaInicioStr} hasta ${fechaFinStr} en ${targetChannel.name}...`);
            
             try {
                const result = await this.channelScanner.scanChannelByDate(targetChannel, fechaInicio, fechaFin);
                
                // VERIFICAR QUE syncResult EXISTE
                const syncResult = result.syncResult || { syncedWeeks: 0, syncedInvoices: 0 };
                
                const dateField = {
                    name: '📅 Rango de Fechas',
                    value: `${fechaInicio.toLocaleDateString('es-ES')} - ${fechaFin.toLocaleDateString('es-ES')}`,
                    inline: true
                };
                
                const embed = this.channelScanner.createScanEmbed(result.bonusData, '✅ Escaneo por Fechas Completado', [dateField]);
                
                // Agregar información de sincronización
                embed.addFields({
                    name: '💾 Datos Guardados',
                    value: `Semanas: ${syncResult.syncedWeeks}\nFacturas: ${syncResult.syncedInvoices}`,
                    inline: true
                });
                
                await this.addEmployeeDetails(embed, result.bonusData);
                
                await startMsg.edit({ content: '', embeds: [embed] });
                
            } catch (error) {
                console.error('❌ Error durante el escaneo:', error);
                await startMsg.edit(`❌ Error durante el escaneo: ${error.message}`);
            }
        } catch (error) {
            console.error('❌ Error en comando scanfecha:', error);
            await message.reply(`❌ Error al procesar el comando: ${error.message}`);
        }
    }

    async handleScan(message, args) {
        try {
            const webhookChannelId = process.env.CANAL_WEBHOOK;
            if (!webhookChannelId) {
                return message.reply('❌ No se ha configurado CANAL_WEBHOOK en el archivo .env');
            }

            const targetChannel = await message.guild.channels.fetch(webhookChannelId);
            if (!targetChannel) {
                return message.reply('❌ No se pudo encontrar el canal de webhook');
            }

            const botPermissions = targetChannel.permissionsFor(message.guild.members.me);
            if (!botPermissions?.has(['ViewChannel', 'ReadMessageHistory'])) {
                return message.reply('❌ No tengo permisos para leer el historial de ese canal');
            }
            
            const messageCount = Math.min(parseInt(args[1]) || 100, this.bot.config.maxScanMessages);
            const startMsg = await message.reply(`🔄 Iniciando escaneo de ${messageCount} mensajes...`);
            
            try {
                const result = await this.channelScanner.scanChannelHistory(targetChannel, messageCount);
                
                const dateField = {
                    name: '📅 Rango Obtenido',
                    value: result.dateRange.oldest && result.dateRange.newest ?
                        `${result.dateRange.oldest.toLocaleDateString('es-ES')} - ${result.dateRange.newest.toLocaleDateString('es-ES')}` :
                        'Sin datos de fecha',
                    inline: true
                };
                
                const embed = this.channelScanner.createScanEmbed(result, '✅ Escaneo de Canal Completado', [dateField]);
                await this.addEmployeeDetails(embed, result);
                
                await this.bot.dataManager.saveData();
                await startMsg.edit({ content: '', embeds: [embed] });
                
            } catch (error) {
                console.error('❌ Error durante el escaneo:', error);
                await startMsg.edit(`❌ Error durante el escaneo: ${error.message}`);
            }
        } catch (error) {
            console.error('❌ Error en comando scan:', error);
            await message.reply(`❌ Error al procesar el comando: ${error.message}`);
        }
    }

    async addEmployeeDetails(embed, result) {
        if (result.employeeBonuses.size > 0 && result.employeeBonuses.size <= 10) {
            let employeeList = '';
            for (const [dni, employeeData] of result.employeeBonuses) {
                let totalPaid = 0;
                for (const weekData of employeeData.weeks.values()) {
                    totalPaid += weekData.totalPaid;
                }
                const bonus = Math.round((totalPaid * this.bot.bonusPercentage) / 100);
                employeeList += `**${employeeData.name}** (${dni})\n💰 $${totalPaid} → 🎁 $${bonus}\n\n`;
            }
            
            if (employeeList.length < 1024) {
                embed.addFields({
                    name: '👤 Detalle por Empleado',
                    value: employeeList,
                    inline: false
                });
            }
        }
    }
}

module.exports = ScanCommands;