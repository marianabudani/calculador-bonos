class MessageParser {
    constructor(bot) {
        this.bot = bot;
        this.patterns = {
            serviceEntry: /^\*\*\[([A-Z]{3}\d+)\]\s+([^*]+?)\*\*\s+ha entrado en servicio/,
            invoiceSent: /^\*\*\[([A-Z]{3}\d+)\]\*\*\s+ha enviado una factura\s+`\$(\d+)\s+\(([^)]+)\)`/,
            invoicePaid: /^\*\*[^*]+\*\*\s+ha pagado una factura\s+`\$(\d+)\s+\(([^)]+)\)`\s+de\s+\*\*\[([A-Z]{3}\d+)\]\**/,
            
            // PATRONES CORREGIDOS PARA INVENTARIO CON FORMATO DISCORD
            // Formato: **[DNI] Nombre** ha retirado/guardado `x# Item`.
            inventoryWithBold: /^\*\*\[([A-Z]{3}\d+)\]\s+([^*]+?)\*\*\s+ha\s+(retirado|guardado)\s+`x(\d+)\s+([^`]+)`\.?$/i,
            
            // Formato alternativo sin backticks: **[DNI] Nombre** ha retirado x# Item.
            inventoryWithBoldNoBT: /^\*\*\[([A-Z]{3}\d+)\]\s+([^*]+?)\*\*\s+ha\s+(retirado|guardado)\s+x(\d+)\s+(.+?)\.?$/i,
            
            // Patrones originales (mantener compatibilidad)
            inventoryWithdraw: /^\[([A-Z]{3}\d+)\]\s+(.+?)\s+(ha retirado|retiró)\s+x?(\d+)\s+(.+?)\.?$/i,
            inventoryDeposit: /^\[([A-Z]{3}\d+)\]\s+(.+?)\s+(ha guardado|guardó)\s+x?(\d+)\s+(.+?)\.?$/i,
            inventoryGeneral: /^\[([A-Z]{3}\d+)\]\s+(.+?)\s+(ha guardado|ha retirado|guardó|retiró)\s+x?(\d+)\s+(.+?)\.?$/i
        };
    }

    isWebhookLog(content) {
        return content.includes('[UDT') || 
               content.includes('ha enviado una factura') || 
               content.includes('ha pagado una factura') ||
               this.isInventoryLog(content);
    }

    // Mejorar detección de logs de inventario
    isInventoryLog(content) {
        const inventoryPatterns = [
            // Detectar formato con negritas Discord
            /\*\*\[[A-Z]{3}\d+\].*?\*\*\s+ha\s+(retirado|guardado)\s+`?x?\d+/i,
            // Formato original
            /\[[A-Z]{3}\d+\].*?(ha guardado|ha retirado|guardó|retiró)\s+x?\d+/i,
            /\[[A-Z]{3}\d+\].*?(depositado|retirado).*?\$?\d+/i
        ];
        
        return inventoryPatterns.some(pattern => pattern.test(content));
    }

    parseLine(line) {
        line = line.trim();
        if (!line) return null;

        console.log(`🔍 Parseando línea: ${line}`); // DEBUG

        // Parsear entrada de servicio
        const serviceMatch = line.match(this.patterns.serviceEntry);
        if (serviceMatch) {
            const [, dni, name] = serviceMatch;
            console.log(`✅ Service entry: ${dni} - ${name}`); // DEBUG
            return { type: 'service_entry', dni, name: name.trim().replace(/\*+/g, '') };
        }

        // Parsear factura enviada
        const invoiceMatch = line.match(this.patterns.invoiceSent);
        if (invoiceMatch) {
            const [, dni, amount] = invoiceMatch;
            console.log(`✅ Invoice sent: ${dni} - $${amount}`); // DEBUG
            return { type: 'invoice_sent', dni, amount: parseInt(amount) };
        }

        // Parsear factura pagada
        const paidMatch = line.match(this.patterns.invoicePaid);
        if (paidMatch) {
            const [, amount, , dni] = paidMatch;
            console.log(`✅ Invoice paid: ${dni} - $${amount}`); // DEBUG
            return { type: 'invoice_paid', dni, amount: parseInt(amount) };
        }

        // PARSING DE INVENTARIO MEJORADO - ORDEN IMPORTANTE
        
        // 1. Intentar formato con negritas Discord y backticks
        let inventoryMatch = line.match(this.patterns.inventoryWithBold);
        if (inventoryMatch) {
            const [, dni, name, actionText, quantity, item] = inventoryMatch;
            const action = actionText.toLowerCase() === 'guardado' ? 'deposit' : 'withdraw';
            console.log(`✅ Inventory (bold+backticks): ${dni} - ${name} - ${action} - ${quantity} ${item}`); // DEBUG
            return {
                type: 'inventory_action',
                dni: dni.toUpperCase(),
                name: name.trim(),
                action: action,
                quantity: parseInt(quantity),
                item: item.trim()
            };
        }

        // 2. Intentar formato con negritas Discord sin backticks
        inventoryMatch = line.match(this.patterns.inventoryWithBoldNoBT);
        if (inventoryMatch) {
            const [, dni, name, actionText, quantity, item] = inventoryMatch;
            const action = actionText.toLowerCase() === 'guardado' ? 'deposit' : 'withdraw';
            console.log(`✅ Inventory (bold no backticks): ${dni} - ${name} - ${action} - ${quantity} ${item}`); // DEBUG
            return {
                type: 'inventory_action',
                dni: dni.toUpperCase(),
                name: name.trim(),
                action: action,
                quantity: parseInt(quantity),
                item: item.trim()
            };
        }

        // 3. Intentar patrones originales (sin negritas)
        inventoryMatch = line.match(this.patterns.inventoryWithdraw);
        if (inventoryMatch) {
            const [, dni, name, action, quantity, item] = inventoryMatch;
            console.log(`✅ Inventory withdraw (original): ${dni} - ${name} - ${quantity} ${item}`); // DEBUG
            return {
                type: 'inventory_action',
                dni: dni.toUpperCase(),
                name: name.trim(),
                action: 'withdraw',
                quantity: parseInt(quantity),
                item: item.trim()
            };
        }

        inventoryMatch = line.match(this.patterns.inventoryDeposit);
        if (inventoryMatch) {
            const [, dni, name, action, quantity, item] = inventoryMatch;
            console.log(`✅ Inventory deposit (original): ${dni} - ${name} - ${quantity} ${item}`); // DEBUG
            return {
                type: 'inventory_action',
                dni: dni.toUpperCase(),
                name: name.trim(),
                action: 'deposit',
                quantity: parseInt(quantity),
                item: item.trim()
            };
        }

        // 4. Patrón general como último recurso
        inventoryMatch = line.match(this.patterns.inventoryGeneral);
        if (inventoryMatch) {
            const [, dni, name, actionText, quantity, item] = inventoryMatch;
            const action = actionText.includes('guardado') || actionText.includes('guardó') ? 'deposit' : 'withdraw';
            console.log(`✅ Inventory general: ${dni} - ${name} - ${action} - ${quantity} ${item}`); // DEBUG
            return {
                type: 'inventory_action',
                dni: dni.toUpperCase(),
                name: name.trim(),
                action: action,
                quantity: parseInt(quantity),
                item: item.trim()
            };
        }

        // 5. Patrones adicionales para casos especiales
        const specialPatterns = [
            // Patrón más flexible para casos edge
            /^\*\*\[([A-Z]{3}\d+)\]([^*]+?)\*\*.*?(retirado|guardado).*?x?(\d+).*?([A-Za-z\s]+)\.?$/i,
            // Sin corchetes
            /^(\w+)\s+(.+?)\s+(ha guardado|ha retirado|guardó|retiró)\s+x?(\d+)\s+(.+?)\.?$/i
        ];

        for (const pattern of specialPatterns) {
            const match = line.match(pattern);
            if (match) {
                const [, dni, name, actionText, quantity, item] = match;
                const action = actionText.includes('guardado') || actionText.includes('guardó') ? 'deposit' : 'withdraw';
                console.log(`✅ Special inventory pattern: ${dni} - ${name || 'Sin nombre'} - ${action} - ${quantity} ${item}`); // DEBUG
                return {
                    type: 'inventory_action',
                    dni: dni.toUpperCase(),
                    name: (name || `Empleado ${dni}`).trim(),
                    action: action,
                    quantity: parseInt(quantity),
                    item: item.trim()
                };
            }
        }

        console.log(`⚠ No se pudo parsear: ${line}`); // DEBUG
        return null;
    }

    async processWebhookLog(logContent, dataManager, weekKey) {
        const lines = logContent.split('\n');
        const results = {
            employeesRegistered: 0,
            employeesUpdated: 0,
            invoicesProcessed: 0,
            inventoryProcessed: 0,
            errors: 0
        };

        console.log(`📋 Procesando ${lines.length} líneas de log...`); // DEBUG

        for (const line of lines) {
            try {
                const parsed = this.parseLine(line);
                if (!parsed) continue;

                switch (parsed.type) {
                    case 'service_entry':
                        const employee = dataManager.registerEmployee(parsed.dni, parsed.name);
                        if (employee.name === parsed.name) {
                            results.employeesRegistered++;
                        } else {
                            results.employeesUpdated++;
                        }
                        break;

                    case 'invoice_sent':
                        let employeeSent = dataManager.getEmployee(parsed.dni);
                        if (!employeeSent) {
                            employeeSent = dataManager.registerEmployee(parsed.dni, `Empleado ${parsed.dni}`);
                            results.employeesRegistered++;
                        }
                        
                        const weekDataSent = employeeSent.getWeekData(weekKey);
                        weekDataSent.addInvoice(parsed.amount, 'sent');
                        results.invoicesProcessed++;
                        break;

                    case 'invoice_paid':
                        let employeePaid = dataManager.getEmployee(parsed.dni);
                        
                        if (!employeePaid) {
                            employeePaid = dataManager.registerEmployee(parsed.dni, `Empleado ${parsed.dni}`);
                            results.employeesRegistered++;
                        }

                        const weekDataPaid = employeePaid.getWeekData(weekKey);
                        if (!weekDataPaid.markInvoiceAsPaid(parsed.amount)) {
                            weekDataPaid.addInvoice(parsed.amount, 'paid');
                        }
                        results.invoicesProcessed++;
                        break;

                    case 'inventory_action':
                        console.log(`📦 Procesando acción de inventario:`, parsed); // DEBUG
                        
                        // INTEGRACIÓN CORRECTA CON INVENTORY SERVICE
                        if (this.bot && this.bot.inventoryService) {
                            try {
                                const success = this.bot.inventoryService.registerInventoryMovement(
                                    parsed.dni,
                                    parsed.name,
                                    parsed.item,
                                    parsed.quantity,
                                    parsed.action,
                                    new Date()
                                );
                                
                                if (success) {
                                    results.inventoryProcessed++;
                                    console.log(`✅ Movimiento de inventario registrado: ${parsed.dni} - ${parsed.action} - ${parsed.quantity} ${parsed.item}`);
                                    
                                    // Registrar empleado si no existe
                                    let inventoryEmployee = dataManager.getEmployee(parsed.dni);
                                    if (!inventoryEmployee) {
                                        inventoryEmployee = dataManager.registerEmployee(parsed.dni, parsed.name);
                                        results.employeesRegistered++;
                                    } else if (inventoryEmployee.name.startsWith('Empleado ') && !parsed.name.startsWith('Empleado ')) {
                                        inventoryEmployee.name = parsed.name;
                                        results.employeesUpdated++;
                                    }
                                } else {
                                    console.log(`⚠ Error registrando movimiento de inventario`);
                                    results.errors++;
                                }
                            } catch (invError) {
                                console.error('❌ Error en inventory service:', invError);
                                results.errors++;
                            }
                        } else {
                            console.log(`⚠ InventoryService no disponible`);
                            results.errors++;
                        }
                        break;
                }
            } catch (error) {
                console.error('❌ Error procesando línea:', error);
                console.error('Línea problemática:', line);
                results.errors++;
            }
        }

        console.log(`✅ Procesados: ${results.employeesRegistered} empleados registrados, ${results.employeesUpdated} actualizados, ${results.invoicesProcessed} facturas, ${results.inventoryProcessed} movimientos inventario, ${results.errors} errores`);
        return results;
    }
}

module.exports = MessageParser;