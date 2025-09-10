const { EmbedBuilder } = require('discord.js');
const { getCurrentWeekRange } = require('../utils/dateUtils');

class HelperCommands {
    constructor(bot) {
        this.bot = bot;
    }

    async handleSemana(message) {
        const weekRange = getCurrentWeekRange();
        
        const embed = new EmbedBuilder()
            .setTitle('📅 Información de Semana Actual')
            .setColor('#00ffff')
            .addFields(
                {
                    name: 'Semana',
                    value: this.bot.currentWeek,
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
            );

        await message.reply({ embeds: [embed] });
    }

    async handleHelp(message) {
        const embed = new EmbedBuilder()
            .setTitle('📖 Comandos del Bot de Bonos Semanales')
            .setColor('#ff9900')
            .addFields(
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
                { name: '!ayuda', value: 'Muestra esta ayuda', inline: true },
                { name: '!repararnombres', value: 'Repara nombres genéricos de empleados', inline: true },
                { name: "📦 Inventario", value: "`!inventario` → stock actual\n`!valorretiros` → valor total retirado en $\n`!procesarlog` → procesa un bloque de log pegado\n`!retirosdni <DNI>` → movimientos de un empleado", inline: false },
                { name: '!syncdata', value: 'Sincroniza datos del último escaneo', inline: true },
            )
            .setFooter({ text: 'Sistema de bonos semanales (Lunes a Domingo)' });

        await message.reply({ embeds: [embed] });
    }
}

module.exports = HelperCommands;