const { EmbedBuilder } = require('discord.js');

class InventoryControl {
    constructor(botInstance = null) {
        this.bot = botInstance; // Referencia al bot principal para acceder a empleados
        
        // Inventario inicial - solo una inicialización
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
            'Kit de Reparación': 0
        };

        // Precios para items auditados
        this.prices = {
            'hamburguesa': 40,
            'whiscola': 40,
            'hidromiel': 40,
            'aros de cebolla': 20,
            'papas fritas': 20,
            'toros del paso': 20,
            'ticket rasca y gana': 250,
            'super vodka': 100,
            'kit de reparación': 290,
            // Agregar más items si es necesario
            'bolsa de comida': 0, // Items no auditados = $0
            'bolsa de liquidos': 0,
            'bandage': 0,
            'bolso de almacenamiento': 0
        };

        this.inventoryLogs = [];
        this.employeeLogs = new Map();
    }

    // Método mejorado para parsear líneas de inventario
    parseInventoryLine(line) {
        // Limpiar la línea
        line = line.trim();
        if (!line) return null;

        // Patrón mejorado que maneja diferentes formatos
        const patterns = [
            /^\[([A-Z]{3}\d+)\]\s+(.+?)\s+(ha guardado|ha retirado)\s+x(\d+)\s+(.+)\.$/,
            /^\[([A-Z]{3}\d+)\]\s*(.+?)\s+(ha guardado|ha retirado)\s+x(\d+)\s+(.+)$/,
            /^\[([A-Z]{3}\d+)\]\s+(.+?)\s+(guardó|retiró)\s+x(\d+)\s+(.+)\.?$/
        ];

        let match = null;
        for (const pattern of patterns) {
            match = line.match(pattern);
            if (match) break;
        }

        if (!match) {
            console.log(`⚠️ No se pudo parsear la línea: ${line}`);
            return null;
        }

        const [, dni, rawName, action, qtyStr, itemName] = match;
        
        // Limpiar y normalizar datos
        const name = rawName.trim().replace(/\s+/g, " ");
        const quantity = parseInt(qtyStr);
        const isDeposit = action.includes("guardado") || action.includes("guardó");
        const item = this.normalizeItemName(itemName.trim());
        
        if (isNaN(quantity) || quantity <= 0) {
            console.log(`⚠️ Cantidad inválida: ${qtyStr}`);
            return null;
        }

        // Actualizar inventario global
        if (!this.inventory.hasOwnProperty(item)) {
            this.inventory[item] = 0;
            console.log(`📦 Nuevo item agregado al inventario: ${item}`);
        }

        const previousStock = this.inventory[item];
        this.inventory[item] += isDeposit ? quantity : -quantity;
        
        // No permitir stock negativo
        if (this.inventory[item] < 0) {
            console.log(`⚠️ Stock negativo detectado para ${item}. Ajustando a 0.`);
            this.inventory[item] = 0;
        }

        // Calcular valor (solo para retiros de items auditados)
        const price = this.prices[item.toLowerCase()] || 0;
        const value = isDeposit ? 0 : quantity * price;

        // Crear entrada de log
        const logEntry = {
            dni: dni.toUpperCase(),
            name,
            action: isDeposit ? "deposit" : "withdraw",
            item,
            quantity,
            value,
            price,
            previousStock,
            currentStock: this.inventory[item],
            timestamp: new Date(),
            weekKey: this.bot ? this.bot.currentWeek : this.getCurrentWeekKey()
        };

        this.inventoryLogs.push(logEntry);

        // Actualizar logs por empleado
        this.updateEmployeeLog(logEntry);

        // Integrar con sistema de empleados del bot principal
        if (this.bot && value > 0) {
            this.updateEmployeeInventoryValue(dni, value);
        }

        return logEntry;
    }

    // Normalizar nombres de items para consistencia
    normalizeItemName(itemName) {
        const normalized = itemName.trim();
        
        // Mapear variaciones comunes
        const itemMappings = {
            'kit de reparacion': 'Kit de Reparación',
            'kit reparacion': 'Kit de Reparación',
            'hamburguesa': 'Hamburguesa',
            'whiscola': 'Whiscola',
            'hidromiel': 'Hidromiel',
            'aros cebolla': 'Aros de Cebolla',
            'aros de cebolla': 'Aros de Cebolla',
            'papas fritas': 'Papas Fritas',
            'toros paso': 'Toros del Paso',
            'toros del paso': 'Toros del Paso',
            'ticket rasca gana': 'Ticket Rasca y Gana',
            'ticket rasca y gana': 'Ticket Rasca y Gana',
            'super vodka': 'Super Vodka',
            'vodka': 'Super Vodka'
        };

        return itemMappings[normalized.toLowerCase()] || normalized;
    }

    // Actualizar log de empleado
    updateEmployeeLog(logEntry) {
        const { dni, name } = logEntry;
        
        if (!this.employeeLogs.has(dni)) {
            this.employeeLogs.set(dni, {
                name,
                deposits: [],
                withdrawals: [],
                totalWithdrawValue: 0,
                totalDeposits: 0,
                totalWithdrawals: 0
            });
        }

        const empData = this.employeeLogs.get(dni);
        empData.name = name; // Actualizar nombre en caso de cambios

        if (logEntry.action === "deposit") {
            empData.deposits.push(logEntry);
            empData.totalDeposits += logEntry.quantity;
        } else {
            empData.withdrawals.push(logEntry);
            empData.totalWithdrawals += logEntry.quantity;
            empData.totalWithdrawValue += logEntry.value;
        }
    }

    // Integrar valor de inventario con empleado en el sistema principal
    updateEmployeeInventoryValue(dni, value) {
        if (!this.bot || !this.bot.employees) return;

        const employee = this.bot.employees.get(dni.toUpperCase());
        if (employee) {
            if (!employee.inventoryValue) employee.inventoryValue = 0;
            employee.inventoryValue += value;
            
            // Guardar datos si existe el dataManager
            if (this.bot.dataManager) {
                this.bot.dataManager.saveData();
            }
        }
    }

    // Obtener semana actual (método auxiliar)
    getCurrentWeekKey() {
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const dayOfWeek = now.getDay();
        const mondayAdjustment = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const mondayOfThisWeek = new Date(now);
        mondayOfThisWeek.setDate(now.getDate() + mondayAdjustment);
        const weekNumber = Math.ceil(((mondayOfThisWeek - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
        return `${now.getFullYear()}-${weekNumber}`;
    }

    // Mostrar inventario actual
    async showInventory(message) {
        const embed = new EmbedBuilder()
            .setTitle("📦 Inventario Actual")
            .setColor("#00ff00")
            .setTimestamp();

        let totalValue = 0;
        let desc = "";
        let itemCount = 0;

        // Ordenar items por cantidad (descendente)
        const sortedItems = Object.entries(this.inventory)
            .sort(([,a], [,b]) => b - a)
            .filter(([,qty]) => qty > 0);

        for (const [item, qty] of sortedItems) {
            const price = this.prices[item.toLowerCase()] || 0;
            const value = qty * price;
            totalValue += value;
            
            const priceText = price > 0 ? ` → $${value}` : " (Sin valor)";
            desc += `**${item}**: ${qty} unidades${priceText}\n`;
            itemCount++;
        }

        if (itemCount === 0) {
            desc = "Inventario vacío.";
        }

        embed.setDescription(desc);
        embed.addFields(
            { name: "💰 Valor Total", value: `$${totalValue}`, inline: true },
            { name: "📊 Items únicos", value: `${itemCount}`, inline: true },
            { name: "📈 Total registros", value: `${this.inventoryLogs.length}`, inline: true }
        );

        await message.reply({ embeds: [embed] });
    }

    // Calcular valor total de retiros
    async calculateWithdrawValue(message) {
        let totalValue = 0;
        let totalItems = 0;
        
        const withdrawLogs = this.inventoryLogs.filter(log => log.action === "withdraw");
        
        for (const log of withdrawLogs) {
            totalValue += log.value;
            totalItems += log.quantity;
        }

        const embed = new EmbedBuilder()
            .setTitle("💰 Resumen de Retiros")
            .setColor("#ff0000")
            .addFields(
                { name: "Valor Total", value: `$${totalValue}`, inline: true },
                { name: "Items Retirados", value: `${totalItems}`, inline: true },
                { name: "Transacciones", value: `${withdrawLogs.length}`, inline: true }
            )
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }

    // Procesar comando de log masivo
    async processLogCommand(message) {
        const lines = message.content.split("\n").slice(1); // Saltar primera línea del comando
        let processed = 0;
        let errors = 0;

        for (const line of lines) {
            if (line.trim()) {
                const result = this.parseInventoryLine(line.trim());
                if (result) {
                    processed++;
                } else {
                    errors++;
                }
            }
        }

        const embed = new EmbedBuilder()
            .setTitle("✅ Log de Inventario Procesado")
            .setColor("#00ff00")
            .addFields(
                { name: "Procesados", value: `${processed}`, inline: true },
                { name: "Errores", value: `${errors}`, inline: true },
                { name: "Total", value: `${lines.length}`, inline: true }
            )
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }

    // Mostrar logs de empleado específico
    async showEmployeeLogs(message, dni) {
        const upperDNI = dni.toUpperCase();
        const empData = this.employeeLogs.get(upperDNI);
        
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

        // Mostrar últimos movimientos (máximo 10)
        let details = "";
        const recentWithdrawals = empData.withdrawals.slice(-5);
        const recentDeposits = empData.deposits.slice(-5);

        if (recentWithdrawals.length > 0) {
            details += "**Últimos retiros:**\n";
            for (const w of recentWithdrawals) {
                details += `➖ ${w.item} x${w.quantity} → $${w.value}\n`;
            }
        }

        if (recentDeposits.length > 0) {
            details += "\n**Últimos depósitos:**\n";
            for (const d of recentDeposits) {
                details += `➕ ${d.item} x${d.quantity}\n`;
            }
        }

        if (details) {
            embed.addFields({ name: "Actividad reciente", value: details, inline: false });
        }

        await message.reply({ embeds: [embed] });
    }

    // Obtener top empleados por valor retirado
    async showTopEmployees(message, limit = 10) {
        if (this.employeeLogs.size === 0) {
            return message.reply("❌ No hay datos de empleados.");
        }

        const employees = Array.from(this.employeeLogs.entries())
            .map(([dni, data]) => ({ dni, ...data }))
            .sort((a, b) => b.totalWithdrawValue - a.totalWithdrawValue)
            .slice(0, limit);

        const embed = new EmbedBuilder()
            .setTitle(`🏆 Top ${limit} Empleados por Retiros`)
            .setColor("#gold")
            .setTimestamp();

        let description = "";
        employees.forEach((emp, index) => {
            const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "📊";
            description += `${medal} **${emp.name}** (${emp.dni}): $${emp.totalWithdrawValue}\n`;
        });

        embed.setDescription(description);
        await message.reply({ embeds: [embed] });
    }

    // Resetear inventario (comando administrativo)
    resetInventory() {
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
            'Kit de Reparación': 0
        };
        this.inventoryLogs = [];
        this.employeeLogs.clear();
        console.log("🔄 Inventario reseteado completamente");
    }

    // Obtener estadísticas generales
    getStats() {
        const totalDeposits = this.inventoryLogs.filter(log => log.action === "deposit").length;
        const totalWithdrawals = this.inventoryLogs.filter(log => log.action === "withdraw").length;
        const totalValue = this.inventoryLogs
            .filter(log => log.action === "withdraw")
            .reduce((sum, log) => sum + log.value, 0);
        
        return {
            totalLogs: this.inventoryLogs.length,
            totalDeposits,
            totalWithdrawals,
            totalValue,
            uniqueEmployees: this.employeeLogs.size,
            uniqueItems: Object.keys(this.inventory).length
        };
    }
}

module.exports = InventoryControl;