const { EmbedBuilder } = require('discord.js');

class InventoryControl{
    constructor() {
        this.inventory = {};
        this.inventoryLogs = [];
        this.employeeLogs = new Map();
        this.inventory = {
            'Bolsa de Comida': 0,
            'Bolsa de Liquidos': 0,
            'Bandage': 0,
            'Bolso de Almacenamiento': 0,
            'Hamburguesa': 0,
            'Whiscola': 0,
            'Hidromiel': 0,
            'Aros de Cebolla': 0,
            'Papas Fritas': 0,
            'Toros del Paso': 0,
            'Ticket Rasca y Gana': 0,
            'Super Vodka': 0,
            'Kit de reparación': 0
        };
        this.prices = {
            'hamburguesa': 40,
            'whiscola': 40,
            'hidromiel': 40,
            'aros de cebolla': 20,
            'papas fritas': 20,
            'toros del paso': 20,
            'ticket rasca y gana': 250,
            'super vodka': 100,
            'kit de reparación': 290
        };
    }

    parseInventoryLine(line) {
        const pattern = /^\[([A-Z]{3}\d+)\]\s+(.+?)\s+(ha guardado|ha retirado)\s+x(\d+)\s+(.+)\.$/;
        const match = line.match(pattern);
        if (!match) return null;

        const [, dni, rawName, action, qtyStr, itemName] = match;
        const name = rawName.trim().replace(/\s+/g, " ");
        const quantity = parseInt(qtyStr);
        const isDeposit = action === "ha guardado";
        const item = itemName.trim();
        const price = this.prices[item.toLowerCase()] || 0;

        // Inventario global
        if (!this.inventory[item]) this.inventory[item] = 0;
        this.inventory[item] += isDeposit ? quantity : -quantity;
        if (this.inventory[item] < 0) this.inventory[item] = 0;

        const value = isDeposit ? 0 : quantity * price;

        const logEntry = {
            dni, name,
            action: isDeposit ? "deposit" : "withdraw",
            item, quantity, value,
            currentStock: this.inventory[item],
            timestamp: new Date()
        };
        this.inventoryLogs.push(logEntry);

        // Registrar por persona
        if (!this.employeeLogs.has(dni)) {
            this.employeeLogs.set(dni, {
                name,
                deposits: [],
                withdrawals: [],
                totalWithdrawValue: 0
            });
        }
        const empData = this.employeeLogs.get(dni);
        if (isDeposit) {
            empData.deposits.push(logEntry);
        } else {
            empData.withdrawals.push(logEntry);
            empData.totalWithdrawValue += value;
        }

        return logEntry;
    }

    async showInventory(message) {
        const embed = new EmbedBuilder()
            .setTitle("📦 Inventario Actual")
            .setColor("#00ff00")
            .setTimestamp();

        let totalValue = 0;
        let desc = "";

        for (const [item, qty] of Object.entries(this.inventory)) {
            if (qty > 0) {
                const price = this.prices[item.toLowerCase()] || 0;
                const value = qty * price;
                totalValue += value;
                desc += `**${item}**: ${qty} unidades${price ? ` → $${value}` : ""}\n`;
            }
        }

        embed.setDescription(desc || "Inventario vacío.");
        embed.addFields({ name: "💰 Valor Total", value: `$${totalValue}`, inline: false });

        await message.reply({ embeds: [embed] });
    }

    async calculateWithdrawValue(message) {
        let totalValue = 0;
        for (const log of this.inventoryLogs) {
            if (log.action === "withdraw") totalValue += log.value;
        }
        await message.reply(`💰 Valor total de retiros: $${totalValue}`);
    }

    async processLogCommand(message) {
        const lines = message.content.split("\n").slice(1);
        for (const line of lines) {
            this.parseInventoryLine(line.trim());
        }
        await message.reply("✅ Log de inventario procesado.");
    }

    async showEmployeeLogs(message, dni) {
        const empData = this.employeeLogs.get(dni.toUpperCase());
        if (!empData) {
            return message.reply(`❌ No se encontraron movimientos para ${dni}`);
        }

        const embed = new EmbedBuilder()
            .setTitle(`📊 Movimientos de ${empData.name} (${dni})`)
            .setColor("#ff6600")
            .addFields(
                { name: "Depósitos", value: `${empData.deposits.length}`, inline: true },
                { name: "Retiros", value: `${empData.withdrawals.length}`, inline: true },
                { name: "💰 Valor retirado", value: `$${empData.totalWithdrawValue}`, inline: true }
            )
            .setTimestamp();

        let details = "";
        for (const w of empData.withdrawals.slice(-5)) {
            details += `➖ ${w.item} x${w.quantity} → $${w.value}\n`;
        }
        for (const d of empData.deposits.slice(-5)) {
            details += `➕ ${d.item} x${d.quantity}\n`;
        }
        embed.addFields({ name: "Últimos movimientos", value: details || "Sin datos", inline: false });

        await message.reply({ embeds: [embed] });
    }
}
module.exports = InventoryControl;