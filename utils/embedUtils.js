const { EmbedBuilder } = require('discord.js');

class EmbedUtils {
    static createEmbed(title, color = '#0099ff', fields = [], footer = null) {
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(color)
            .setTimestamp();

        if (fields.length > 0) {
            embed.addFields(...fields);
        }

        if (footer) {
            embed.setFooter(footer);
        }

        return embed;
    }

    static createSuccessEmbed(title, description = null) {
        const embed = this.createEmbed(title, '#00ff00');
        if (description) {
            embed.setDescription(description);
        }
        return embed;
    }

    static createErrorEmbed(title, description = null) {
        const embed = this.createEmbed(title, '#ff0000');
        if (description) {
            embed.setDescription(description);
        }
        return embed;
    }

    static createWarningEmbed(title, description = null) {
        const embed = this.createEmbed(title, '#ff9900');
        if (description) {
            embed.setDescription(description);
        }
        return embed;
    }

    static createInfoEmbed(title, description = null) {
        const embed = this.createEmbed(title, '#0099ff');
        if (description) {
            embed.setDescription(description);
        }
        return embed;
    }

    static createScanResultEmbed(result, title, additionalFields = []) {
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
                value: `$${result.totalBonuses || 0}`,
                inline: true
            },
            ...additionalFields
        ];

        return this.createEmbed(title, '#00ff00', fields);
    }

    static createBonusEmbed(bonusData, title, isCurrentWeek = false) {
        const fields = [
            {
                name: 'Período',
                value: isCurrentWeek ? `${bonusData.period} (Semana actual)` : `Semana ${bonusData.weekKey}`,
                inline: true
            },
            {
                name: 'Porcentaje de Bono',
                value: `${bonusData.percentage}%`,
                inline: true
            }
        ];

        // Agregar campos de empleados
        for (const [dni, employee] of bonusData.employeeBonuses) {
            fields.push({
                name: `${employee.name} (${dni})`,
                value: `💰 Ventas: $${employee.sales}\n🎁 Bono: $${employee.bonus}\n📋 Facturas: ${employee.paidInvoices}`,
                inline: true
            });
        }

        // Agregar resumen
        if (bonusData.employeeCount > 0) {
            fields.push({
                name: '📊 Resumen Semanal',
                value: `Empleados con ventas: ${bonusData.employeeCount}\nTotal bonos: $${bonusData.totalBonuses}`,
                inline: false
            });
        } else {
            fields.push({
                name: 'Sin ventas',
                value: `No hay facturas pagadas registradas para esta semana.`,
                inline: false
            });
        }

        return this.createEmbed(title, isCurrentWeek ? '#00ff00' : '#0099ff', fields);
    }

    static createEmployeeListEmbed(employees, title, currentWeekKey) {
        const fields = [];

        for (const [dni, employee] of employees) {
            const currentWeekData = employee.weeklyData.get(currentWeekKey);
            const totalPaid = currentWeekData ? currentWeekData.totalPaid : 0;
            const paidInvoices = currentWeekData ? currentWeekData.getPaidInvoices().length : 0;
            const pendingInvoices = currentWeekData ? currentWeekData.getPendingInvoices().length : 0;
            
            fields.push({
                name: `${employee.name} (${dni})`,
                value: `📅 Esta semana: $${totalPaid}\n📈 Histórico: $${employee.getTotalPaid()}\n✅ Pagadas: ${paidInvoices} | ⏳ Pendientes: ${pendingInvoices}`,
                inline: true
            });
        }

        return this.createEmbed(title, '#0099ff', fields);
    }

    static createConfigEmbed(config, currentChannel) {
        const fields = [
            {
                name: 'Canales de Logs',
                value: config.logChannelIds.length > 0 ? 
                    config.logChannelIds.map(id => `<#${id}>`).join(', ') : 
                    'Todos los canales permitidos',
                inline: false
            },
            {
                name: 'Canales de Comandos',
                value: config.commandChannelIds.length > 0 ? 
                    config.commandChannelIds.map(id => `<#${id}>`).join(', ') : 
                    'Todos los canales permitidos',
                inline: false
            },
            {
                name: 'Canal Actual',
                value: `<#${currentChannel.id}> (${currentChannel.id})`,
                inline: false
            }
        ];

        return this.createEmbed('⚙️ Configuración del Bot', '#ff6600', fields, { 
            text: 'Usa !setchannel para configurar canales específicos' 
        });
    }

    static createHelpEmbed() {
        const fields = [
            { name: '!bonos', value: 'Calcula bonos de la semana actual', inline: true },
            { name: '!bonossemana [semana]', value: 'Calcula bonos de una semana específica', inline: true },
            { name: '!cerrarsemana', value: 'Muestra resumen final de la semana', inline: true },
            { name: '!historial [DNI]', value: 'Muestra historial de ventas', inline: true },
            { name: '!empleados', value: 'Lista empleados con datos actuales', inline: true },
            { name: '!setbono [%]', value: 'Establece porcentaje de bono', inline: true },
            { name: '!config', value: 'Muestra configuración actual', inline: true },
            { name: '!setchannel', value: 'Configura canales específicos', inline: true },
            { name: '!reset', value: 'Elimina todos los datos', inline: true },
            { name: '!scanfecha [inicio] [fin]', value: 'Escanea por rango de fechas', inline: true },
            { name: '!scan [número]', value: 'Escanea mensajes anteriores', inline: true },
            { name: '!semana', value: 'Información de la semana actual', inline: true },
            { name: "📦 Inventario", value: "`!inventario` → stock actual\n`!valorretiros` → valor total retirado en $\n`!procesarlog` → procesa un bloque de log pegado\n`!retirosdni <DNI>` → movimientos de un empleado", inline: false },
            { name: '!ayuda', value: 'Muestra esta ayuda', inline: true }
        ];

        return this.createEmbed(
            '📖 Comandos del Bot de Bonos Semanales', 
            '#ff9900', 
            fields,
            { text: 'Sistema de bonos semanales (Lunes a Domingo)' }
        );
    }
}

module.exports = EmbedUtils;