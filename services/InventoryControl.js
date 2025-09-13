const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

class InventoryControl {
    constructor(botInstance = null) {
        this.bot = botInstance;
        
        // Inventario global
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
            'Kit de Reparación': 0,
            'Monstruo': 0,
            'Facturadora': 0,
            'Dinero': 0
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
            'dinero': 1, 
            'monstruo': 20,
            'facturadora': 2000,
            'bolsa de comida': 10,
            'bolsa de liquidos': 10,
            'bandage': 0,
            'bolso de almacenamiento': 1800
        };

        // Datos estructurados por empleado y semana
        this.employeeWeeklyInventory = new Map(); // dni -> semana -> datos
        this.employeeCashFlow = new Map(); // dni -> semana -> cash flows
        
        // Logs globales
        this.inventoryLogs = [];
        this.employeeLogs = new Map();
        
        // Archivo de datos
        this.dataFile = './inventory_data.json';
    }

    // MÉTODO PRINCIPAL - Registrar movimiento usando datos ya parseados
    registerInventoryMovement(dni, employeeName, item, quantity, action, timestamp) {
        try {
            console.log(`🔧 Registrando movimiento: ${dni} - ${employeeName} - ${action} - ${quantity} ${item}`);
            
            // Normalizar datos
            const normalizedDNI = dni.toUpperCase();
            const normalizedItem = this.normalizeItemName(item);
            const cleanName = employeeName.trim();
            const weekKey = this.bot ? this.bot.currentWeek : this.getCurrentWeekKey();
            
            // Validar cantidad
            if (isNaN(quantity) || quantity <= 0) {
                console.log(`❌ Cantidad inválida: ${quantity}`);
                return false;
            }

            // Detectar si es dinero (cash flow)
            const isCash = this.isCashTransaction(normalizedItem, item);
            
            if (isCash) {
                return this.registerCashFlow(normalizedDNI, cleanName, quantity, action, timestamp, weekKey);
            } else {
                return this.registerItemMovement(normalizedDNI, cleanName, normalizedItem, quantity, action, timestamp, weekKey);
            }

        } catch (error) {
            console.error('❌ Error registrando movimiento de inventario:', error);
            return false;
        }
    }

    // Detectar transacciones de dinero
    isCashTransaction(normalizedItem, originalItem) {
        const cashIndicators = [
            'dinero',
            'fondos',
            originalItem.includes('$'),
            normalizedItem.toLowerCase().includes('dinero'),
            originalItem.toLowerCase().includes('fondos')
        ];
        
        return cashIndicators.some(indicator => indicator === true || indicator === normalizedItem.toLowerCase());
    }

    // Registrar flujo de dinero
    registerCashFlow(dni, name, amount, action, timestamp, weekKey) {
        try {
            // Inicializar estructura si no existe
            if (!this.employeeCashFlow.has(dni)) {
                this.employeeCashFlow.set(dni, new Map());
            }
            
            if (!this.employeeCashFlow.get(dni).has(weekKey)) {
                this.employeeCashFlow.get(dni).set(weekKey, {
                    deposits: [],
                    withdrawals: [],
                    totalDeposited: 0,
                    totalWithdrawn: 0,
                    netCashFlow: 0
                });
            }

            const weekCash = this.employeeCashFlow.get(dni).get(weekKey);
            
            const cashEntry = {
                dni,
                name,
                amount,
                action,
                timestamp,
                weekKey
            };

            if (action === 'deposit') {
                weekCash.deposits.push(cashEntry);
                weekCash.totalDeposited += amount;
                this.inventory['Dinero'] += amount;
            } else {
                weekCash.withdrawals.push(cashEntry);
                weekCash.totalWithdrawn += amount;
                this.inventory['Dinero'] = Math.max(0, this.inventory['Dinero'] - amount);
            }

            weekCash.netCashFlow = weekCash.totalDeposited - weekCash.totalWithdrawn;

            console.log(`✅ Flujo de dinero registrado: ${dni} - ${action} - $${amount}`);
            return true;

        } catch (error) {
            console.error('❌ Error registrando flujo de dinero:', error);
            return false;
        }
    }

    // Registrar movimiento de item
    registerItemMovement(dni, name, item, quantity, action, timestamp, weekKey) {
        try {
            // Actualizar inventario global
            if (!this.inventory.hasOwnProperty(item)) {
                this.inventory[item] = 0;
                console.log(`📦 Nuevo item agregado al inventario: ${item}`);
            }

            const previousStock = this.inventory[item];
            this.inventory[item] += action === 'deposit' ? quantity : -quantity;
            
            if (this.inventory[item] < 0) {
                console.log(`⚠️ Stock negativo detectado para ${item}. Ajustando a 0.`);
                this.inventory[item] = 0;
            }

            // Calcular valor
            const price = this.prices[item.toLowerCase()] || 0;
            const value = action === 'withdraw' ? quantity * price : 0;

            // Registrar en estructura por empleado/semana
            this.registerEmployeeWeeklyMovement(dni, name, weekKey, item, quantity, action, value, price, timestamp);

            // Crear entrada de log global
            const logEntry = {
                dni,
                name,
                action,
                item,
                quantity,
                value,
                price,
                previousStock,
                currentStock: this.inventory[item],
                timestamp,
                weekKey
            };

            this.inventoryLogs.push(logEntry);
            this.updateEmployeeLog(logEntry);

            console.log(`✅ Movimiento registrado: ${dni} - ${action} - ${quantity} ${item} (Valor: $${value})`);
            return true;

        } catch (error) {
            console.error('❌ Error registrando movimiento de item:', error);
            return false;
        }
    }

    // Registrar movimiento en estructura por empleado/semana
    registerEmployeeWeeklyMovement(dni, name, weekKey, item, quantity, action, value, price, timestamp) {
        // Inicializar estructura si no existe
        if (!this.employeeWeeklyInventory.has(dni)) {
            this.employeeWeeklyInventory.set(dni, new Map());
        }
        
        if (!this.employeeWeeklyInventory.get(dni).has(weekKey)) {
            this.employeeWeeklyInventory.get(dni).set(weekKey, {
                employeeName: name,
                items: new Map(),
                totalValue: 0,
                totalWithdrawn: 0,
                totalDeposited: 0,
                movements: []
            });
        }

        const weekData = this.employeeWeeklyInventory.get(dni).get(weekKey);
        weekData.employeeName = name; // Actualizar nombre

        // Inicializar item si no existe
        if (!weekData.items.has(item)) {
            weekData.items.set(item, {
                deposited: 0,
                withdrawn: 0,
                currentBalance: 0,
                totalValue: 0,
                movements: []
            });
        }

        const itemData = weekData.items.get(item);
        
        // Actualizar datos del item
        if (action === 'deposit') {
            itemData.deposited += quantity;
            itemData.currentBalance += quantity;
            weekData.totalDeposited += quantity;
        } else {
            itemData.withdrawn += quantity;
            itemData.currentBalance -= quantity;
            itemData.totalValue += value;
            weekData.totalWithdrawn += quantity;
            weekData.totalValue += value;
        }

        // Registrar movimiento individual
        const movement = {
            item,
            quantity,
            action,
            value,
            price,
            timestamp
        };
        
        itemData.movements.push(movement);
        weekData.movements.push(movement);
    }

    // Normalizar nombres de items
    normalizeItemName(itemName) {
        const normalized = itemName.trim();
        
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
            'vodka': 'Super Vodka',
            'monstruo': 'Monstruo',
            'facturadora': 'Facturadora',
            'bolsa de comida': 'Bolsa de Comida',
            'bolsa de liquidos': 'Bolsa de Liquidos',
            'bandage': 'Bandage',
            'bolso de almacenamiento': 'Bolso de Almacenamiento',
            'dinero': 'Dinero'
        };

        return itemMappings[normalized.toLowerCase()] || normalized;
    }

    // Actualizar log de empleado (método legacy)
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
        empData.name = name;

        if (logEntry.action === "deposit") {
            empData.deposits.push(logEntry);
            empData.totalDeposits += logEntry.quantity;
        } else {
            empData.withdrawals.push(logEntry);
            empData.totalWithdrawals += logEntry.quantity;
            empData.totalWithdrawValue += logEntry.value;
        }
    }

    // Obtener semana actual
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

    // ============ COMANDOS DE DISCORD ============

    // Comando: !inventario - Mostrar inventario global
    async showInventory(message) {
        const embed = new EmbedBuilder()
            .setTitle("📦 Inventario Global")
            .setColor("#00ff00")
            .setTimestamp();

        let totalValue = 0;
        let desc = "";
        let itemCount = 0;

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
        } else if (desc.length > 4096) {
            desc = desc.substring(0, 4000) + "...\n*(Lista truncada)*";
        }

        embed.setDescription(desc);
        embed.addFields(
            { name: "💰 Valor Total", value: `$${totalValue}`, inline: true },
            { name: "📊 Items únicos", value: `${itemCount}`, inline: true },
            { name: "👥 Empleados activos", value: `${this.employeeWeeklyInventory.size}`, inline: true },
            { name: "📈 Total registros", value: `${this.inventoryLogs.length}`, inline: true }
        );

        await message.reply({ embeds: [embed] });
    }

    // Comando: !inventarioempleado [DNI] [semana] - Detalle por empleado y semana
    async showEmployeeWeeklyInventory(message, dni, weekKey = null) {
        const targetDNI = dni.toUpperCase();
        const targetWeek = weekKey || (this.bot ? this.bot.currentWeek : this.getCurrentWeekKey());

        const employeeWeeks = this.employeeWeeklyInventory.get(targetDNI);
        if (!employeeWeeks) {
            return message.reply(`❌ No se encontraron datos de inventario para ${dni}`);
        }

        const weekData = employeeWeeks.get(targetWeek);
        if (!weekData) {
            return message.reply(`❌ No hay datos de inventario para ${dni} en la semana ${targetWeek}`);
        }

        const embed = new EmbedBuilder()
            .setTitle(`📦 Inventario: ${weekData.employeeName} (${dni})`)
            .setColor("#00ff00")
            .addFields(
                { name: "📅 Semana", value: targetWeek, inline: true },
                { name: "💰 Valor total retirado", value: `$${weekData.totalValue}`, inline: true },
                { name: "📊 Items manipulados", value: `${weekData.items.size}`, inline: true }
            )
            .setTimestamp();

        let itemDetails = "";
        for (const [itemName, itemData] of weekData.items) {
            const symbol = itemData.withdrawn > itemData.deposited ? "⬇️" : "⬆️";
            itemDetails += `${symbol} **${itemName}**\n`;
            itemDetails += `   Retirado: ${itemData.withdrawn} | Depositado: ${itemData.deposited}\n`;
            itemDetails += `   Valor: $${itemData.totalValue}\n\n`;
        }

        if (itemDetails.length > 1024) {
            itemDetails = itemDetails.substring(0, 1000) + "...\n*(Lista truncada)*";
        }

        if (itemDetails) {
            embed.addFields({ name: "📋 Detalle por Item", value: itemDetails, inline: false });
        }

        // Mostrar flujo de dinero si existe
        const cashFlow = this.employeeCashFlow.get(targetDNI)?.get(targetWeek);
        if (cashFlow) {
            embed.addFields({
                name: "💸 Flujo de Dinero",
                value: `Retirado: $${cashFlow.totalWithdrawn}\nDepositado: $${cashFlow.totalDeposited}\nNeto: $${cashFlow.netCashFlow}`,
                inline: true
            });
        }

        await message.reply({ embeds: [embed] });
    }

    // Comando: !exportarinventario - Exportar datos como archivo JSON
    async exportInventoryData(message) {
        try {
            const exportData = {
                timestamp: new Date().toISOString(),
                currentWeek: this.bot ? this.bot.currentWeek : this.getCurrentWeekKey(),
                globalInventory: this.inventory,
                prices: this.prices,
                stats: {
                    totalEmployees: this.employeeWeeklyInventory.size,
                    totalCashFlowEmployees: this.employeeCashFlow.size,
                    totalLogs: this.inventoryLogs.length
                },
                employeeWeeklyData: this.mapToObject(this.employeeWeeklyInventory),
                employeeCashFlow: this.mapToObject(this.employeeCashFlow),
                inventoryLogs: this.inventoryLogs
            };

            // Guardar archivo localmente
            await fs.writeFile(this.dataFile, JSON.stringify(exportData, null, 2));

            // Crear attachment para Discord
            const jsonData = JSON.stringify(exportData, null, 2);
            const buffer = Buffer.from(jsonData, 'utf8');
            const attachment = new AttachmentBuilder(buffer, { 
                name: `inventario_${new Date().toISOString().split('T')[0]}.json` 
            });

            const embed = new EmbedBuilder()
                .setTitle("📋 Exportación de Inventario")
                .setColor("#00ff00")
                .addFields(
                    { name: "📊 Total empleados", value: `${exportData.stats.totalEmployees}`, inline: true },
                    { name: "💸 Empleados con cash flow", value: `${exportData.stats.totalCashFlowEmployees}`, inline: true },
                    { name: "📈 Total logs", value: `${exportData.stats.totalLogs}`, inline: true }
                )
                .setTimestamp();

            await message.reply({ 
                content: "📁 Datos de inventario exportados:",
                embeds: [embed], 
                files: [attachment] 
            });

        } catch (error) {
            console.error('❌ Error exportando inventario:', error);
            await message.reply('❌ Error al exportar los datos de inventario.');
        }
    }

    // Comando: !topretiros [semana] - Top empleados por retiros
    async showTopWithdrawals(message, weekKey = null) {
        const targetWeek = weekKey || (this.bot ? this.bot.currentWeek : this.getCurrentWeekKey());
        
        const weeklyData = [];
        
        for (const [dni, employeeWeeks] of this.employeeWeeklyInventory) {
            const weekData = employeeWeeks.get(targetWeek);
            if (weekData && weekData.totalValue > 0) {
                weeklyData.push({
                    dni,
                    name: weekData.employeeName,
                    totalValue: weekData.totalValue,
                    totalItems: weekData.totalWithdrawn
                });
            }
        }

        // Agregar datos de cash flow
        for (const [dni, cashWeeks] of this.employeeCashFlow) {
            const cashData = cashWeeks.get(targetWeek);
            if (cashData && cashData.totalWithdrawn > 0) {
                const existing = weeklyData.find(emp => emp.dni === dni);
                if (existing) {
                    existing.cashWithdrawn = cashData.totalWithdrawn;
                    existing.totalValue += cashData.totalWithdrawn;
                } else {
                    weeklyData.push({
                        dni,
                        name: `Empleado ${dni}`,
                        totalValue: cashData.totalWithdrawn,
                        cashWithdrawn: cashData.totalWithdrawn,
                        totalItems: 0
                    });
                }
            }
        }

        if (weeklyData.length === 0) {
            return message.reply(`❌ No hay datos de retiros para la semana ${targetWeek}`);
        }

        weeklyData.sort((a, b) => b.totalValue - a.totalValue);

        const embed = new EmbedBuilder()
            .setTitle(`🏆 Top Retiros - Semana ${targetWeek}`)
            .setColor("#ffd700")
            .setTimestamp();

        let description = "";
        weeklyData.slice(0, 10).forEach((emp, index) => {
            const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}°`;
            const cashText = emp.cashWithdrawn ? ` (Cash: $${emp.cashWithdrawn})` : "";
            description += `${medal} **${emp.name}** (${emp.dni}): $${emp.totalValue}${cashText}\n`;
        });

        embed.setDescription(description);
        await message.reply({ embeds: [embed] });
    }

    // Método auxiliar para convertir Maps a objetos
    mapToObject(map) {
        const obj = {};
        for (const [key, value] of map) {
            if (value instanceof Map) {
                obj[key] = this.mapToObject(value);
            } else {
                obj[key] = value;
            }
        }
        return obj;
    }

    // Calcular valor total de retiros (comando legacy)
    async calculateWithdrawValue(message) {
        let totalValue = 0;
        let totalItems = 0;
        let totalCash = 0;
        
        // Sumar items
        const withdrawLogs = this.inventoryLogs.filter(log => log.action === "withdraw");
        for (const log of withdrawLogs) {
            totalValue += log.value;
            totalItems += log.quantity;
        }

        // Sumar cash flows
        for (const [, cashWeeks] of this.employeeCashFlow) {
            for (const [, cashData] of cashWeeks) {
                totalCash += cashData.totalWithdrawn;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle("💰 Resumen Global de Retiros")
            .setColor("#ff0000")
            .addFields(
                { name: "📦 Valor Items", value: `$${totalValue}`, inline: true },
                { name: "💸 Dinero Retirado", value: `$${totalCash}`, inline: true },
                { name: "💰 Total General", value: `$${totalValue + totalCash}`, inline: true },
                { name: "📊 Items Retirados", value: `${totalItems}`, inline: true },
                { name: "📈 Transacciones", value: `${withdrawLogs.length}`, inline: true },
                { name: "👥 Empleados", value: `${this.employeeWeeklyInventory.size}`, inline: true }
            )
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }

    // Mostrar logs de empleado específico (mejorado)
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
                { name: "📦 Depósitos", value: `${empData.deposits.length}`, inline: true },
                { name: "📤 Retiros", value: `${empData.withdrawals.length}`, inline: true },
                { name: "💰 Valor retirado", value: `$${empData.totalWithdrawValue}`, inline: true }
            )
            .setTimestamp();

        // Mostrar últimos movimientos
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

        if (details && details.length < 1024) {
            embed.addFields({ name: "Actividad reciente", value: details, inline: false });
        }

        await message.reply({ embeds: [embed] });
    }

    // Método legacy - no usar
    parseInventoryLine(line) {
        console.log(`⚠️ Método parseInventoryLine legacy llamado. Línea: ${line}`);
        return null;
    }

    // Procesar comando de log masivo (mejorado)
    async processLogCommand(message) {
        const embed = new EmbedBuilder()
            .setTitle("ℹ️ Procesamiento de Logs")
            .setColor("#ffaa00")
            .setDescription("Use `!scanfecha DD/MM/AAAA DD/MM/AAAA` para procesar logs automáticamente.\n\nEste comando ya no procesa logs directamente.")
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }

    // Resetear inventario
    resetInventory() {
        this.inventory = {
            'Bolsa de Comida': 0, 'Bolsa de Liquidos': 0, 'Bandage': 0, 'Bolso de Almacenamiento': 0,
            'Hamburguesa': 0, 'Whiscola': 0, 'Hidromiel': 0, 'Aros de Cebolla': 0, 'Papas Fritas': 0,
            'Toros del Paso': 0, 'Ticket Rasca y Gana': 0, 'Super Vodka': 0, 'Kit de Reparación': 0,
            'Monstruo': 0, 'Facturadora': 0, 'Dinero': 0
        };
        this.inventoryLogs = [];
        this.employeeLogs.clear();
        this.employeeWeeklyInventory.clear();
        this.employeeCashFlow.clear();
        console.log("🔄 Inventario reseteado completamente");
    }

    // Estadísticas generales
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
            uniqueItems: Object.keys(this.inventory).length,
            weeklyEmployees: this.employeeWeeklyInventory.size,
            cashFlowEmployees: this.employeeCashFlow.size
        };
    }
}

module.exports = InventoryControl;