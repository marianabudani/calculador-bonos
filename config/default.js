function loadConfig(customConfig = {}) {
    const defaultConfig = {
        logChannelIds: process.env.CANAL_WEBHOOK ? [process.env.CANAL_WEBHOOK] : [],
        commandChannelIds: process.env.ID_CANAL_BOT ? [process.env.ID_CANAL_BOT] : [],
        allowAllChannels: true,
        dataFile: './bot_data.json',
        maxScanMessages: 1000,
        bonusPercentage: 10
    };

    return { ...defaultConfig, ...customConfig };
}

module.exports = { loadConfig };