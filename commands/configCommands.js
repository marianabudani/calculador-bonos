const { EmbedBuilder } = require('discord.js');

class ConfigCommands {
    constructor(bot) {
        this.bot = bot;
    }

    async handleSetBono(message, newPercentage) {
        const percentage = parseInt(newPercentage);
        
        if (isNaN(percentage) || percentage < 0 || percentage > 100) {
            return message.reply('❌ Porcentaje inválido. Usa un número entre 0 y 100.');
        }

        this.bot.bonusPercentage = percentage;
        await this.bot.dataManager.saveData();
        await message.reply(`✅ Porcentaje de bono actualizado a ${percentage}%`);
    }

    async handleConfig(message) {
        const embed = new EmbedBuilder()
            .setTitle('⚙️ Configuración del Bot')
            .setColor('#ff6600')
            .addFields(
                {
                    name: 'Canales de Logs',
                    value: this.bot.config.logChannelIds.length > 0 ? 
                        this.bot.config.logChannelIds.map(id => `<#${id}>`).join(', ') : 
                        'Todos los canales permitidos',
                    inline: false
                },
                {
                    name: 'Canales de Comandos',
                    value: this.bot.config.commandChannelIds.length > 0 ? 
                        this.bot.config.commandChannelIds.map(id => `<#${id}>`).join(', ') : 
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

        await message.reply({ embeds: [embed] });
    }

    async handleSetChannel(message, args) {
        if (args.length < 3) {
            return message.reply('❌ Uso: `!setchannel [logs/comandos/reset] [ID_del_canal]`\n\nEjemplos:\n`!setchannel logs 123456789`\n`!setchannel comandos 987654321`\n`!setchannel reset`');
        }

        const type = args[1].toLowerCase();
        const channelId = args[2];

        if (type === 'reset') {
            this.bot.config.logChannelIds = [];
            this.bot.config.commandChannelIds = [];
            this.bot.config.allowAllChannels = true;
            return message.reply('✅ Configuración reseteada. El bot funcionará en todos los canales.');
        }

        if (type === 'logs') {
            if (!this.bot.config.logChannelIds.includes(channelId)) {
                this.bot.config.logChannelIds.push(channelId);
                this.bot.config.allowAllChannels = false;
            }
            return message.reply(`✅ Canal <#${channelId}> agregado para procesar logs del webhook.`);
        }

        if (type === 'comandos') {
            if (!this.bot.config.commandChannelIds.includes(channelId)) {
                this.bot.config.commandChannelIds.push(channelId);
                this.bot.config.allowAllChannels = false;
            }
            return message.reply(`✅ Canal <#${channelId}> agregado para comandos del bot.`);
        }

        await message.reply('❌ Tipo inválido. Usa: `logs`, `comandos` o `reset`');
    }

    async handleReset(message) {
        this.bot.employees.clear();
        await this.bot.dataManager.saveData();
        await message.reply('🗑️ Todos los datos han sido eliminados.');
    }
    async handleSyncData(message) {
        const syncMsg = await message.reply('🔄 Sincronizando datos del último escaneo...');
        
        try {
            const result = await this.bot.dataManager.forceSyncFromScan();
            
            if (result.syncedCount > 0 || result.invoiceCount > 0) {
                await syncMsg.edit(`✅ Datos sincronizados: ${result.syncedCount} empleados, ${result.invoiceCount} facturas`);
            } else {
                await syncMsg.edit('✅ No hay datos nuevos para sincronizar');
            }
        } catch (error) {
            console.error('Error en sync data:', error);
            await syncMsg.edit('❌ Error al sincronizar datos: ' + error.message);
        }
    }
}

module.exports = ConfigCommands;