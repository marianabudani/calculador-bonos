const { EmbedBuilder } = require('discord.js');
const { getCurrentWeekRange } = require('../utils/dateUtils');

class BonusCommands {
    constructor(bot) {
        this.bot = bot;
    }

    async handleBonos(message) {
        await this.calculateWeeklyBonuses(message, this.bot.currentWeek);
    }

    async handleBonosSemana(message, weekKey) {
        await this.calculateWeeklyBonuses(message, weekKey || this.bot.currentWeek);
    }

    async calculateWeeklyBonuses(message, weekKey) {
        if (this.bot.employees.size === 0) {
            return message.reply('No hay empleados registrados aún.');
        }

        const weekRange = getCurrentWeekRange();
        const isCurrentWeek = weekKey === this.bot.currentWeek;

        const embed = new EmbedBuilder()
            .setTitle(`🏆 Bonos - Semana ${weekKey}`)
            .setColor(isCurrentWeek ? '#00ff00' : '#0099ff')
            .addFields(
                {
                    name: 'Período',
                    value: isCurrentWeek ? `${weekRange.formatted} (Semana actual)` : `Semana ${weekKey}`,
                    inline: true
                },
                {
                    name: 'Porcentaje de Bono',
                    value: `${this.bot.bonusPercentage}%`,
                    inline: true
                }
            );

        let totalBonuses = 0;
        let employeeCount = 0;

        for (const [dni, employee] of this.bot.employees) {
            const weekData = employee.weeklyData.get(weekKey);
            if (weekData && weekData.totalPaid > 0) {
                const bonus = Math.round((weekData.totalPaid * this.bot.bonusPercentage) / 100);
                const paidInvoices = weekData.getPaidInvoices().length;
                
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
                value: `No hay facturas pagadas registradas para la semana ${weekKey}.`,
                inline: false
            });
        } else {
            embed.addFields({
                name: '📊 Resumen Semanal',
                value: `Empleados con ventas: ${employeeCount}\nTotal bonos: $${totalBonuses}`,
                inline: false
            });
        }

        await message.reply({ embeds: [embed] });
    }

    async handleCerrarSemana(message) {
        const weekRange = getCurrentWeekRange();
        
        await this.calculateWeeklyBonuses(message, this.bot.currentWeek);
        
        const confirmEmbed = new EmbedBuilder()
            .setTitle('📅 Semana Cerrada')
            .setColor('#ff9900')
            .addFields(
                {
                    name: 'Semana cerrada',
                    value: `${this.bot.currentWeek} (${weekRange.formatted})`,
                    inline: false
                },
                {
                    name: 'Nueva semana',
                    value: 'Los próximos registros se contarán para la nueva semana.',
                    inline: false
                }
            );

        await message.reply({ embeds: [confirmEmbed] });
    }

    async handleHistorial(message, employeeDni = null) {
        if (this.bot.employees.size === 0) {
            return message.reply('No hay empleados registrados.');
        }

        const embed = new EmbedBuilder()
            .setTitle('📈 Historial de Ventas por Semana')
            .setColor('#9900ff');

        if (employeeDni) {
            const employee = this.bot.employees.get(employeeDni.toUpperCase());
            if (!employee) {
                return message.reply(`No se encontró el empleado con DNI: ${employeeDni}`);
            }

            embed.setTitle(`📈 Historial - ${employee.name} (${employeeDni.toUpperCase()})`);
            
            const sortedWeeks = Array.from(employee.weeklyData.keys()).sort().reverse();
            
            for (const week of sortedWeeks.slice(0, 8)) {
                const data = employee.weeklyData.get(week);
                const bonus = Math.round((data.totalPaid * this.bot.bonusPercentage) / 100);
                const isCurrentWeek = week === this.bot.currentWeek;
                
                embed.addFields({
                    name: `Semana ${week} ${isCurrentWeek ? '(Actual)' : ''}`,
                    value: `💰 $${data.totalPaid} → 🎁 $${bonus}`,
                    inline: true
                });
            }
        } else {
            const allWeeks = new Set();
            for (const employee of this.bot.employees.values()) {
                for (const week of employee.weeklyData.keys()) {
                    allWeeks.add(week);
                }
            }
            
            const sortedWeeks = Array.from(allWeeks).sort().reverse();
            
            for (const week of sortedWeeks.slice(0, 4)) {
                let weekTotal = 0;
                let employeesWithSales = 0;
                
                for (const employee of this.bot.employees.values()) {
                    const weekData = employee.weeklyData.get(week);
                    if (weekData && weekData.totalPaid > 0) {
                        weekTotal += weekData.totalPaid;
                        employeesWithSales++;
                    }
                }
                
                if (weekTotal > 0) {
                    const totalBonuses = Math.round((weekTotal * this.bot.bonusPercentage) / 100);
                    const isCurrentWeek = week === this.bot.currentWeek;
                    
                    embed.addFields({
                        name: `Semana ${week} ${isCurrentWeek ? '(Actual)' : ''}`,
                        value: `💰 Total: $${weekTotal}\n👥 Empleados: ${employeesWithSales}\n🎁 Bonos: $${totalBonuses}`,
                        inline: true
                    });
                }
            }
        }

        await message.reply({ embeds: [embed] });
    }

    async handleEmpleados(message) {
        if (this.bot.employees.size === 0) {
            return message.reply('No hay empleados registrados.');
        }

        const embed = new EmbedBuilder()
            .setTitle('👥 Empleados - Semana Actual')
            .setColor('#0099ff');

        for (const [dni, employee] of this.bot.employees) {
            const currentWeekData = employee.weeklyData.get(this.bot.currentWeek);
            const totalPaid = currentWeekData ? currentWeekData.totalPaid : 0;
            const paidInvoices = currentWeekData ? currentWeekData.getPaidInvoices().length : 0;
            const pendingInvoices = currentWeekData ? currentWeekData.getPendingInvoices().length : 0;
            
            embed.addFields({
                name: `${employee.name} (${dni})`,
                value: `📅 Esta semana: $${totalPaid}\n📈 Histórico: $${employee.getTotalPaid()}\n✅ Pagadas: ${paidInvoices} | ⏳ Pendientes: ${pendingInvoices}`,
                inline: true
            });
        }

        await message.reply({ embeds: [embed] });
    }
}

module.exports = BonusCommands;