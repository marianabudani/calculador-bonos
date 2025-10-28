const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

class InventoryControl {
    constructor(botInstance = null) {
        this.bot = botInstance;
        
        // Inventario global - SERÁ CARGADO/GUARDADO
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

        // NUEVO: Stock base inicial (para referencia)
        this.baseStock = { ...this.inventory };
        
        // NUEVO: Flag para saber si ya se configuró el stock inicial
        this.isBaseStockConfigured = false;
        
        // NUEVO: Timestamp de cuando se configuró el stock base
        this.baseStockTimestamp = null;

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
        this.employeeWeeklyInventory = new Map();
        this.employeeCashFlow = new Map();
        
        // Logs globales
        this.inventoryLogs = [];
        this.employeeLogs = new Map();
        
        // Archivo de datos
        this.dataFile = './inventory_data.json';
        
        // NUEVO: Cargar datos al inicializar
        this.loadInventoryData();
    }

    // ============ NUEVOS MÉTODOS PARA STOCK BASE ============

    // Configurar stock inicial mediante comando
    async setBaseStock(message, stockData = null) {
        try {
            if (stockData) {
                // Configurar desde datos pasados como parámetro
                this.updateBaseStock(stockData);
            } else {
                // Configurar mediante embed interactivo
                await this.showBaseStockConfiguration(message);
                return;
            }
            
            await this.saveInventoryData();
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Stock Base Configurado')
                .setColor('#00ff00')
                .setDescription('El inventario base ha sido configurado exitosamente.')
                .addFields(
                    { name: '📅 Fecha de configuración', value: new Date().toLocaleString('es-ES'), inline: true },
                    { name: '📊 Items configurados', value: `${Object.keys(this.baseStock).length}`, inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            
        } catch (error) {
            console.error('❌ Error configurando stock base:', error);
            await message.reply('❌ Error al configurar el stock base.');
        }
    }

    // Actualizar stock base interno
    updateBaseStock(stockData) {
        for (const [item, quantity] of Object.entries(stockData)) {
            const normalizedItem = this.normalizeItemName(item);
            if (this.inventory.hasOwnProperty(normalizedItem)) {
                this.baseStock[normalizedItem] = parseInt(quantity) || 0;
                this.inventory[normalizedItem] = parseInt(quantity) || 0;
            }
        }
        
        this.isBaseStockConfigured = true;
        this.baseStockTimestamp = new Date();
        
        console.log('📦 Stock base actualizado:', this.baseStock);
    }

    // Mostrar configuración interactiva de stock base
    async showBaseStockConfiguration(message) {
        const embed = new EmbedBuilder()
            .setTitle('📦 Configuración de Stock Base Inicial')
            .setColor('#ffaa00')
            .setDescription('Para configurar el stock inicial, usa el comando con el siguiente formato:\n\n' +
                '**Opción 1: Comando directo**\n' +
                '```\n!inventario-setbase Hamburguesa:50 Whiscola:30 Dinero:5000\n```\n\n' +
                '**Opción 2: Archivo JSON**\n' +
                'Pega el siguiente formato después del comando `!inventario-loadbase`:\n' +
                '```json\n{\n  "Hamburguesa": 50,\n  "Whiscola": 30,\n  "Dinero": 5000\n}\n```')
            .addFields(
                { 
                    name: '📋 Items Disponibles', 
                    value: Object.keys(this.inventory).join(', '), 
                    inline: false 
                },
                {
                    name: '⚠️ Importante',
                    value: 'Esta acción sobrescribirá el inventario actual y establecerá un nuevo punto de partida.',
                    inline: false
                }
            )
            .setFooter({ text: 'El stock base solo debe configurarse UNA VEZ al inicio.' });

        await message.reply({ embeds: [embed] });
    }

    // Comando para configurar stock con formato: !inventario-setbase Item1:cantidad1 Item2:cantidad2
    async handleSetBaseCommand(message, args) {
        if (args.length < 2) {
            await this.showBaseStockConfiguration(message);
            return;
        }

        try {
            const stockData = {};
            
            // Parsear argumentos: Item1:cantidad1 Item2:cantidad2
            for (let i = 1; i < args.length; i++) {
                const arg = args[i];
                if (arg.includes(':')) {
                    const [item, quantity] = arg.split(':');
                    stockData[item.trim()] = parseInt(quantity.trim()) || 0;
                }
            }

            if (Object.keys(stockData).length === 0) {
                await message.reply('❌ No se pudo parsear el formato. Usa: `!inventario-setbase Item1:cantidad1 Item2:cantidad2`');
                return;
            }

            await this.setBaseStock(message, stockData);
            
        } catch (error) {
            console.error('❌ Error en handleSetBaseCommand:', error);
            await message.reply('❌ Error procesando el comando de stock base.');
        }
    }

    // Cargar stock desde JSON pegado
    async handleLoadBaseCommand(message) {
        const embed = new EmbedBuilder()
            .setTitle('📥 Cargar Stock Base desde JSON')
            .setColor('#0099ff')
            .setDescription('Pega un JSON con el siguiente formato en tu próximo mensaje:\n\n' +
                '```json\n{\n  "Hamburguesa": 50,\n  "Whiscola": 30,\n  "Aros de Cebolla": 20,\n  "Dinero": 5000\n}\n```\n\n' +
                'El bot detectará automáticamente el JSON y configurará el stock base.')
            .setFooter({ text: 'Tienes 60 segundos para enviar el JSON' });

        await message.reply({ embeds: [embed] });

        // Escuchar el próximo mensaje del usuario
        const filter = (m) => m.author.id === message.author.id;
        const collector = message.channel.createMessageCollector({ filter, time: 60000, max: 1 });

        collector.on('collect', async (m) => {
            try {
                const content = m.content.trim();
                let jsonData;

                // Intentar parsear JSON
                if (content.startsWith('{') && content.endsWith('}')) {
                    jsonData = JSON.parse(content);
                } else {
                    // Buscar JSON en el mensaje
                    const jsonMatch = content.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        jsonData = JSON.parse(jsonMatch[0]);
                    } else {
                        await m.reply('❌ No se pudo encontrar un JSON válido en tu mensaje.');
                        return;
                    }
                }

                await this.setBaseStock(m, jsonData);
                
            } catch (error) {
                console.error('❌ Error parseando JSON:', error);
                await m.reply('❌ Error al parsear el JSON. Verifica que el formato sea válido.');
            }
        });

        collector.on('end', (collected) => {
            if (collected.size === 0) {
                message.channel.send('⏰ Tiempo agotado. Comando cancelado.');
            }
        });
    }

    // Mostrar diferencia entre stock base y actual
    async showStockComparison(message) {
        if (!this.isBaseStockConfigured) {
            return message.reply('❌ No se ha configurado un stock base. Usa `!inventario-setbase` primero.');
        }

        const embed = new EmbedBuilder()
            .setTitle('📊 Comparación: Stock Base vs Actual')
            .setColor('#9932cc')
            .addFields(
                {
                    name: '📅 Stock base configurado',
                    value: this.baseStockTimestamp.toLocaleString('es-ES'),
                    inline: false
                }
            );

        let comparison = '';
        let totalDifference = 0;

        for (const [item, baseQty] of Object.entries(this.baseStock)) {
            const currentQty = this.inventory[item] || 0;
            const difference = currentQty - baseQty;
            
            if (difference !== 0 || baseQty > 0) {
                const symbol = difference > 0 ? '📈' : difference < 0 ? '📉' : '➡️';
                const sign = difference > 0 ? '+' : '';
                
                comparison += `${symbol} **${item}**: ${baseQty} → ${currentQty} (${sign}${difference})\n`;
                
                // Calcular diferencia monetaria
                const price = this.prices[item.toLowerCase()] || 0;
                totalDifference += difference * price;
            }
        }

        if (comparison) {
            if (comparison.length > 1024) {
                comparison = comparison.substring(0, 1000) + '...\n*(Lista truncada)*';
            }
            embed.addFields({ name: '📋 Cambios Detectados', value: comparison, inline: false });
        } else {
            embed.addFields({ name: '✅ Sin Cambios', value: 'El inventario actual coincide con el stock base.', inline: false });
        }

        embed.addFields({
            name: '💰 Diferencia de Valor',
            value: `$${totalDifference}`,
            inline: true
        });

        await message.reply({ embeds: [embed] });
    }

    // ============ MÉTODOS DE PERSISTENCIA MEJORADOS ============

    // Cargar datos de inventario desde archivo
    async loadInventoryData() {
        try {
            const data = await fs.readFile(this.dataFile, 'utf8');
            const parsedData = JSON.parse(data);
            
            // Cargar inventario actual
            if (parsedData.inventory) {
                this.inventory = { ...this.inventory, ...parsedData.inventory };
            }
            
            // Cargar stock base
            if (parsedData.baseStock) {
                this.baseStock = parsedData.baseStock;
                this.isBaseStockConfigured = parsedData.isBaseStockConfigured || false;
                this.baseStockTimestamp = parsedData.baseStockTimestamp ? new Date(parsedData.baseStockTimestamp) : null;
            }
            
            // Cargar precios si existen
            if (parsedData.prices) {
                this.prices = { ...this.prices, ...parsedData.prices };
            }
            
            // Cargar estructuras de empleados (Maps)
            if (parsedData.employeeWeeklyInventory) {
                this.employeeWeeklyInventory = this.objectToMap(parsedData.employeeWeeklyInventory);
            }
            
            if (parsedData.employeeCashFlow) {
                this.employeeCashFlow = this.objectToMap(parsedData.employeeCashFlow);
            }
            
            // Cargar logs
            if (parsedData.inventoryLogs) {
                this.inventoryLogs = parsedData.inventoryLogs;
            }
            
            if (parsedData.employeeLogs) {
                this.employeeLogs = new Map(Object.entries(parsedData.employeeLogs));
            }
            
            console.log('💾 Datos de inventario cargados correctamente');
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('📁 No se encontró archivo de inventario, iniciando con datos vacíos');
            } else {
                console.error('❌ Error al cargar datos de inventario:', error);
            }
        }
    }

    // Guardar datos de inventario
    async saveInventoryData() {
        try {
            const data = {
                // Inventario y stock base
                inventory: this.inventory,
                baseStock: this.baseStock,
                isBaseStockConfigured: this.isBaseStockConfigured,
                baseStockTimestamp: this.baseStockTimestamp,
                
                // Configuración
                prices: this.prices,
                
                // Datos de empleados
                employeeWeeklyInventory: this.mapToObject(this.employeeWeeklyInventory),
                employeeCashFlow: this.mapToObject(this.employeeCashFlow),
                
                // Logs
                inventoryLogs: this.inventoryLogs,
                employeeLogs: Object.fromEntries(this.employeeLogs),
                
                // Metadata
                savedAt: new Date().toISOString(),
                version: '2.0'
            };
            
            await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
            console.log('💾 Datos de inventario guardados correctamente');
            
        } catch (error) {
            console.error('❌ Error al guardar datos de inventario:', error);
        }
    }

    // ============ MÉTODOS EXISTENTES MEJORADOS ============

    // Método principal mejorado - ahora guarda automáticamente
    registerInventoryMovement(dni, employeeName, item, quantity, action, timestamp) {
        try {
            const success = this.registerItemMovement(dni, employeeName, item, quantity, action, timestamp);
            
            if (success) {
                // Auto-guardar después de cada movimiento
                this.saveInventoryData().catch(err => {
                    console.error('❌ Error auto-guardando inventario:', err);
                });
            }
            
            return success;
        } catch (error) {
            console.error('❌ Error registrando movimiento de inventario:', error);
            return false;
        }
    }

    // Registrar movimiento de item (modificado para trabajar con stock base)
    registerItemMovement(dni, name, item, quantity, action, timestamp, weekKey = null) {
        try {
            const normalizedDNI = dni.toUpperCase();
            const normalizedItem = this.normalizeItemName(item);
            const cleanName = name.trim();
            const currentWeekKey = weekKey || (this.bot ? this.bot.currentWeek : this.getCurrentWeekKey());
            
            // Validar cantidad
            if (isNaN(quantity) || quantity <= 0) {
                console.log(`❌ Cantidad inválida: ${quantity}`);
                return false;
            }

            // Detectar si es dinero (cash flow)
            const isCash = this.isCashTransaction(normalizedItem, item);
            
            if (isCash) {
                return this.registerCashFlow(normalizedDNI, cleanName, quantity, action, timestamp, currentWeekKey);
            }

            // Actualizar inventario global
            if (!this.inventory.hasOwnProperty(normalizedItem)) {
                this.inventory[normalizedItem] = 0;
                // También agregar al stock base si no existe
                if (!this.baseStock.hasOwnProperty(normalizedItem)) {
                    this.baseStock[normalizedItem] = 0;
                }
                console.log(`📦 Nuevo item agregado al inventario: ${normalizedItem}`);
            }

            const previousStock = this.inventory[normalizedItem];
            this.inventory[normalizedItem] += action === 'deposit' ? quantity : -quantity;
            
            if (this.inventory[normalizedItem] < 0) {
                console.log(`⚠️ Stock negativo detectado para ${normalizedItem}. Ajustando a 0.`);
                this.inventory[normalizedItem] = 0;
            }

            // Calcular valor
            const price = this.prices[normalizedItem.toLowerCase()] || 0;
            const value = action === 'withdraw' ? quantity * price : 0;

            // Registrar en estructura por empleado/semana
            this.registerEmployeeWeeklyMovement(normalizedDNI, cleanName, currentWeekKey, normalizedItem, quantity, action, value, price, timestamp);

            // Crear entrada de log global
            const logEntry = {
                dni: normalizedDNI,
                name: cleanName,
                action,
                item: normalizedItem,
                quantity,
                value,
                price,
                previousStock,
                currentStock: this.inventory[normalizedItem],
                timestamp,
                weekKey: currentWeekKey
            };

            this.inventoryLogs.push(logEntry);
            this.updateEmployeeLog(logEntry);

            console.log(`✅ Movimiento registrado: ${normalizedDNI} - ${action} - ${quantity} ${normalizedItem} (Valor: $${value})`);
            return true;

        } catch (error) {
            console.error('❌ Error registrando movimiento de item:', error);
            return false;
        }
    }

    // Comando mejorado para mostrar inventario (ahora incluye comparación con base si existe)
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
            
            // Mostrar diferencia con stock base si está configurado
            let baseInfo = '';
            if (this.isBaseStockConfigured && this.baseStock[item] !== undefined) {
                const baseQty = this.baseStock[item];
                const diff = qty - baseQty;
                if (diff !== 0) {
                    const sign = diff > 0 ? '+' : '';
                    baseInfo = ` (Base: ${baseQty}, ${sign}${diff})`;
                }
            }
            
            const priceText = price > 0 ? ` → $${value}` : " (Sin valor)";
            desc += `**${item}**: ${qty} unidades${baseInfo}${priceText}\n`;
            itemCount++;
        }

        if (itemCount === 0) {
            desc = "Inventario vacío.";
        } else if (desc.length > 4096) {
            desc = desc.substring(0, 4000) + "...\n*(Lista truncada)*";
        }

        embed.setDescription(desc);
        
        const fields = [
            { name: "💰 Valor Total", value: `$${totalValue}`, inline: true },
            { name: "📊 Items únicos", value: `${itemCount}`, inline: true },
            { name: "👥 Empleados activos", value: `${this.employeeWeeklyInventory.size}`, inline: true },
            { name: "📈 Total registros", value: `${this.inventoryLogs.length}`, inline: true }
        ];
        
        // Agregar información del stock base si está configurado
        if (this.isBaseStockConfigured) {
            fields.push({
                name: "📅 Stock base configurado",
                value: this.baseStockTimestamp.toLocaleDateString('es-ES'),
                inline: true
            });
        }
        
        embed.addFields(...fields);

        await message.reply({ embeds: [embed] });
    }

    // ============ MÉTODOS AUXILIARES ============

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

    // Registrar flujo de dinero (sin cambios)
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

    // Normalizar nombres de items (sin cambios)
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

    // Método auxiliar para convertir Maps a objetos (sin cambios)
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

    // Método auxiliar para convertir objetos a Maps
    objectToMap(obj) {
        const map = new Map();
        for (const [key, value] of Object.entries(obj)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                // Si el valor es un objeto, recursivamente convertir
                if (this.isMapLikeObject(value)) {
                    map.set(key, this.objectToMap(value));
                } else {
                    map.set(key, value);
                }
            } else {
                map.set(key, value);
            }
        }
        return map;
    }

    // Verificar si un objeto parece ser un Map serializado
    isMapLikeObject(obj) {
        // Heurística simple: si tiene claves que parecen DNIs o semanas
        const keys = Object.keys(obj);
        return keys.some(key => 
            /^[A-Z]{3}\d+$/.test(key) ||  // DNI pattern
            /^\d{4}-\d{1,2}$/.test(key)   // Week pattern
        );
    }

    // ============ MÉTODOS EXISTENTES (mantenidos sin cambios) ============
    
    registerEmployeeWeeklyMovement(dni, name, weekKey, item, quantity, action, value, price, timestamp) {
        // (Código existente sin cambios)
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
        weekData.employeeName = name;

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

    // ============ COMANDOS DE DISCORD EXISTENTES ============

    // Comando: !inventario-empleado [DNI] [semana] - Detalle por empleado y semana
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
                { name: "💰 Valor total retirado", value: `${weekData.totalValue}`, inline: true },
                { name: "📊 Items manipulados", value: `${weekData.items.size}`, inline: true }
            )
            .setTimestamp();

        let itemDetails = "";
        for (const [itemName, itemData] of weekData.items) {
            const symbol = itemData.withdrawn > itemData.deposited ? "⬇️" : "⬆️";
            itemDetails += `${symbol} **${itemName}**\n`;
            itemDetails += `   Retirado: ${itemData.withdrawn} | Depositado: ${itemData.deposited}\n`;
            itemDetails += `   Valor: ${itemData.totalValue}\n\n`;
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
                value: `Retirado: ${cashFlow.totalWithdrawn}\nDepositado: ${cashFlow.totalDeposited}\nNeto: ${cashFlow.netCashFlow}`,
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
                baseStock: this.baseStock,
                isBaseStockConfigured: this.isBaseStockConfigured,
                baseStockTimestamp: this.baseStockTimestamp,
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
            await this.saveInventoryData();

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
                    { name: "📈 Total logs", value: `${exportData.stats.totalLogs}`, inline: true },
                    { name: "📦 Stock base configurado", value: this.isBaseStockConfigured ? 'Sí' : 'No', inline: true }
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
            const cashText = emp.cashWithdrawn ? ` (Cash: ${emp.cashWithdrawn})` : "";
            description += `${medal} **${emp.name}** (${emp.dni}): ${emp.totalValue}${cashText}\n`;
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
                { name: "📦 Valor Items", value: `${totalValue}`, inline: true },
                { name: "💸 Dinero Retirado", value: `${totalCash}`, inline: true },
                { name: "💰 Total General", value: `${totalValue + totalCash}`, inline: true },
                { name: "📊 Items Retirados", value: `${totalItems}`, inline: true },
                { name: "📈 Transacciones", value: `${withdrawLogs.length}`, inline: true },
                { name: "👥 Empleados", value: `${this.employeeWeeklyInventory.size}`, inline: true }
            );
            
        // Agregar información del stock base si está disponible
        if (this.isBaseStockConfigured) {
            embed.addFields({
                name: "📅 Desde stock base",
                value: this.baseStockTimestamp.toLocaleDateString('es-ES'),
                inline: true
            });
        }

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
                { name: "💰 Valor retirado", value: `${empData.totalWithdrawValue}`, inline: true }
            )
            .setTimestamp();

        // Mostrar últimos movimientos
        let details = "";
        const recentWithdrawals = empData.withdrawals.slice(-5);
        const recentDeposits = empData.deposits.slice(-5);

        if (recentWithdrawals.length > 0) {
            details += "**Últimos retiros:**\n";
            for (const w of recentWithdrawals) {
                details += `➖ ${w.item} x${w.quantity} → ${w.value}\n`;
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
        this.baseStock = { ...this.inventory };
        this.isBaseStockConfigured = false;
        this.baseStockTimestamp = null;
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
            cashFlowEmployees: this.employeeCashFlow.size,
            isBaseStockConfigured: this.isBaseStockConfigured,
            baseStockTimestamp: this.baseStockTimestamp
        };
    }
}

module.exports = InventoryControl;