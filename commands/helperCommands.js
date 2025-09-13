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
                // COMANDOS DE BONOS
                { name: '🏆 **COMANDOS DE BONOS**', value: '\u200b', inline: false },
                { name: '!bonos', value: 'Calcula bonos de la semana actual', inline: true },
                { name: '!bonossemana [semana]', value: 'Calcula bonos de una semana específica', inline: true },
                { name: '!cerrarsemana', value: 'Muestra resumen final de la semana', inline: true },
                { name: '!historial [DNI]', value: 'Muestra historial de ventas', inline: true },
                { name: '!empleados', value: 'Lista empleados con datos actuales', inline: true },
                
                // COMANDOS DE CONFIGURACIÓN
                { name: '⚙️ **CONFIGURACIÓN**', value: '\u200b', inline: false },
                { name: '!setbono [%]', value: 'Establece porcentaje de bono', inline: true },
                { name: '!config', value: 'Muestra configuración actual', inline: true },
                { name: '!setchannel', value: 'Configura canales específicos', inline: true },
                { name: '!reset', value: 'Elimina todos los datos', inline: true },
                { name: '!syncdata', value: 'Sincroniza datos del último escaneo', inline: true },
                { name: '!repararnombres', value: 'Repara nombres genéricos de empleados', inline: true },
                
                // COMANDOS DE ESCANEO
                { name: '🔍 **ESCANEO**', value: '\u200b', inline: false },
                { name: '!scanfecha [inicio] [fin]', value: 'Escanea por rango de fechas (DD/MM/AAAA)', inline: true },
                { name: '!scan [número]', value: 'Escanea mensajes anteriores', inline: true },
                { name: '!procesar', value: 'Procesa logs pegados manualmente', inline: true },
                
                // COMANDOS DE INVENTARIO
                { name: '📦 **INVENTARIO**', value: '\u200b', inline: false },
                { name: '!inventario', value: 'Muestra stock global actual', inline: true },
                { name: '!inventario-empleados', value: 'Lista todos los empleados con inventario', inline: true },
                { name: '!inventario-empleado <DNI>', value: 'Inventario específico de un empleado', inline: true },
                { name: '!valorretiros', value: 'Valor total retirado en pesos', inline: true },
                { name: '!inventario-top [número]', value: 'Top empleados por valor retirado', inline: true },
                { name: '!inventario-stats', value: 'Estadísticas generales de inventario', inline: true },
                { name: '!inventario-item [nombre]', value: 'Estadísticas de un item específico', inline: true },
                { name: '!precios', value: 'Lista de precios de items auditados', inline: true },
                { name: '!procesarlog', value: 'Procesa bloque de log de inventario', inline: true },
                
                // COMANDOS ADMINISTRATIVOS
                { name: '🔧 **ADMINISTRACIÓN**', value: '\u200b', inline: false },
                { name: '!inventario-reset', value: '⚠️ Resetea completamente el inventario', inline: true },
                { name: '!inventario-export', value: 'Exporta datos de inventario', inline: true },
                { name: '!test-inventory', value: '🧪 Prueba el parsing de inventario', inline: true },
                
                // COMANDOS DE AYUDA
                { name: 'ℹ️ **INFORMACIÓN**', value: '\u200b', inline: false },
                { name: '!semana', value: 'Información de la semana actual', inline: true },
                { name: '!ayuda', value: 'Muestra esta ayuda', inline: true }
            )
            .setFooter({ text: 'Sistema de bonos semanales (Lunes a Domingo) + Control de Inventario' });

        await message.reply({ embeds: [embed] });
    }

    async handleInventoryHelp(message) {
        const embed = new EmbedBuilder()
            .setTitle('📦 Comandos de Inventario - Guía Detallada')
            .setColor('#e67e22')
            .addFields(
                // COMANDOS BÁSICOS
                { name: '📊 **CONSULTAS BÁSICAS**', value: '\u200b', inline: false },
                { 
                    name: '!inventario', 
                    value: 'Muestra el stock actual de todos los items con sus valores en pesos.\nEjemplo: `!inventario`', 
                    inline: false 
                },
                { 
                    name: '!inventario-empleados', 
                    value: 'Lista todos los empleados que tienen items en su inventario personal.\nMuestra cantidad de items y valor total por empleado.\nEjemplo: `!inventario-empleados`', 
                    inline: false 
                },
                { 
                    name: '!inventario-empleado <DNI>', 
                    value: 'Muestra el inventario completo de un empleado específico:\n• Items actuales en stock\n• Historial de movimientos\n• Valor total retirado\nEjemplo: `!inventario-empleado ABC123`', 
                    inline: false 
                },

                // ANÁLISIS Y ESTADÍSTICAS
                { name: '📈 **ANÁLISIS Y ESTADÍSTICAS**', value: '\u200b', inline: false },
                { 
                    name: '!valorretiros', 
                    value: 'Calcula el valor total en pesos de todos los retiros realizados.\nSolo cuenta items con precio configurado.\nEjemplo: `!valorretiros`', 
                    inline: false 
                },
                { 
                    name: '!inventario-top [número]', 
                    value: 'Ranking de empleados por valor total retirado.\nPor defecto muestra top 10, máximo 20.\nEjemplo: `!inventario-top 5`', 
                    inline: false 
                },
                { 
                    name: '!inventario-stats', 
                    value: 'Estadísticas generales del sistema:\n• Total de movimientos\n• Empleados únicos\n• Items únicos\n• Valor total\nEjemplo: `!inventario-stats`', 
                    inline: false 
                },
                { 
                    name: '!inventario-item [nombre]', 
                    value: 'Estadísticas detalladas de un item específico:\n• Stock actual\n• Total depositado/retirado\n• Top empleados que lo retiran\nEjemplo: `!inventario-item Hamburguesa`\nSin nombre: muestra stats de todos los items', 
                    inline: false 
                },

                // PROCESAMIENTO
                { name: '🔄 **PROCESAMIENTO DE LOGS**', value: '\u200b', inline: false },
                { 
                    name: '!procesarlog', 
                    value: 'Procesa múltiples líneas de log pegadas después del comando.\nFormato esperado:\n`!procesarlog`\n`[DNI] Nombre ha retirado x5 Item.`\n`[DNI] Nombre ha guardado x3 Item.`', 
                    inline: false 
                },
                { 
                    name: '!scanfecha DD/MM/AAAA DD/MM/AAAA', 
                    value: '**¡CORRIGE EL FORMATO!** Asegúrate de usar:\n`!scanfecha 01/09/2025 12/09/2025`\n(Con ambas barras "/" en ambas fechas)', 
                    inline: false 
                },

                // INFORMACIÓN ADICIONAL
                { name: '💡 **INFORMACIÓN ADICIONAL**', value: '\u200b', inline: false },
                { 
                    name: 'Items con Precio (Auditados)', 
                    value: 'Hamburguesa ($40), Whiscola ($40), Hidromiel ($40), Aros de Cebolla ($20), Papas Fritas ($20), Toros del Paso ($20), Ticket Rasca y Gana ($250), Super Vodka ($100), Kit de Reparación ($290)', 
                    inline: false 
                },
                { 
                    name: 'Items sin Precio', 
                    value: 'Bolsa de Comida, Bolsa de Liquidos, Bandage, Bolso de Almacenamiento\n(Estos no se cuentan en valores monetarios)', 
                    inline: false 
                }
            )
            .setFooter({ text: 'Usa !precios para ver la lista completa de precios actualizados' });

        await message.reply({ embeds: [embed] });
    }
}

module.exports = HelperCommands;