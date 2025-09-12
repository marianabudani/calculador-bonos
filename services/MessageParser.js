class MessageParser {
    constructor(bot) {
        this.bot = bot;
        this.patterns = {
            serviceEntry: /^\*\*\[([A-Z]{3}\d+)\]\s+([^*]+?)\*\*\s+ha entrado en servicio/,
            invoiceSent: /^\*\*\[([A-Z]{3}\d+)\]\*\*\s+ha enviado una factura\s+`\$(\d+)\s+\(([^)]+)\)`/,
            invoicePaid: /^\*\*[^*]+\*\*\s+ha pagado una factura\s+`\$(\d+)\s+\(([^)]+)\)`\s+de\s+\*\*\[([A-Z]{3}\d+)\]\**/,
            // Nuevos patrones para inventario
            inventoryAction: /^\[([A-Z]{3}\d+)\]\s+(.+?)\s+(ha guardado|ha retirado|guardó|retiró)\s+x(\d+)\s+(.+)\.?$/
        };
    }

    isWebhookLog(content) {
        return content.includes('[UDT') || 
               content.includes('ha enviado una factura') || 
               content.includes('ha pagado una factura') ||
               this.isInventoryLog(content); // Agregar detección de inventario
    }

    // Nuevo método para detectar logs de inventario
    isInventoryLog(content) {
        return /\[[A-Z]{3}\d+\].*?(ha guardado|ha retirado|guardó|retiró)\s+x\d+/.test(content);
    }

    parseLine(line) {
        line = line.trim();
        if (!line) return null;

        // Parsear entrada de servicio
        const serviceMatch = line.match(this.patterns.serviceEntry);
        if (serviceMatch) {
            const [, dni, name] = serviceMatch;
            return { type: 'service_entry', dni, name: name.trim().replace(/\*+/g, '') };
        }

        // Parsear factura enviada
        const invoiceMatch = line.match(this.patterns.invoiceSent);
        if (invoiceMatch) {
            const [, dni, amount] = invoiceMatch;
            return { type: 'invoice_sent', dni, amount: parseInt(amount) };
        }

        // Parsear factura pagada
        const paidMatch = line.match(this.patterns.invoicePaid);
        if (paidMatch) {
            const [, amount, , dni] = paidMatch;
            return { type: 'invoice_paid', dni, amount: parseInt(amount) };
        }

        // Patrones de inventario
        const inventoryWithdrawPattern = /\[(\w+)\]\s+(.+?)\s+ha retirado\s+(x?\d+)\s+(.+?)\.$/;
        const inventoryDepositPattern = /\[(\w+)\]\s+(.+?)\s+ha guardado\s+(x?\d+)\s+(.+?)\.$/;
        const fundsWithdrawPattern = /\[(\w+)\]\s+(.+?)\s+ha retirado\s+\$?(\d+)\s+Dinero\.$/;
        const fundsDepositPattern = /\[(\w+)\]\s+(.+?)\s+ha depositado\s+\$?(\d+)\s+en los fondos\.$/;
        const withdrawMatch = line.match(inventoryWithdrawPattern);
            if (withdrawMatch) {
                return {
                    type: 'inventory_action',
                    dni: withdrawMatch[1],
                    name: withdrawMatch[2],
                    action: 'withdraw',
                    quantity: parseInt(withdrawMatch[3].replace('x', '')),
                    item: withdrawMatch[4]
                };
            }
            
            const depositMatch = line.match(inventoryDepositPattern);
            if (depositMatch) {
                return {
                    type: 'inventory_action',
                    dni: depositMatch[1],
                    name: depositMatch[2],
                    action: 'deposit',
                    quantity: parseInt(depositMatch[3].replace('x', '')),
                    item: depositMatch[4]
                };
            }

        return null;
    }

    async processWebhookLog(logContent, dataManager, weekKey) {
        const lines = logContent.split('\n');
        const results = {
            employeesRegistered: 0,
            employeesUpdated: 0,
            invoicesProcessed: 0,
            inventoryProcessed: 0, // NUEVO
            errors: 0
        };

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
                            const extractedName = this.extractNameFromPayer(parsed.payerName, parsed.dni);
                            employeePaid = dataManager.registerEmployee(
                                parsed.dni, 
                                extractedName || `Empleado ${parsed.dni}`
                            );
                            results.employeesRegistered++;
                        } 
                        else if (employeePaid.name.startsWith('Empleado ') && parsed.payerName) {
                            const extractedName = this.extractNameFromPayer(parsed.payerName, parsed.dni);
                            if (extractedName) {
                                employeePaid.name = extractedName;
                                results.employeesUpdated++;
                                console.log(`🔄 Nombre actualizado: ${employeePaid.name} (${parsed.dni})`);
                            }
                        }

                        const weekDataPaid = employeePaid.getWeekData(weekKey);
                        if (!weekDataPaid.markInvoiceAsPaid(parsed.amount)) {
                            weekDataPaid.addInvoice(parsed.amount, 'paid');
                        }
                        results.invoicesProcessed++;
                        break;

                    // NUEVO: Procesar acción de inventario
                    case 'inventory_action':
                        if (this.bot.inventoryService) {
                            const logEntry = this.bot.inventoryService.parseInventoryLine(line);
                            if (logEntry) {
                                results.inventoryProcessed++;
                                
                                // Registrar empleado si no existe
                                let inventoryEmployee = dataManager.getEmployee(parsed.dni);
                                if (!inventoryEmployee) {
                                    inventoryEmployee = dataManager.registerEmployee(parsed.dni, parsed.name);
                                    results.employeesRegistered++;
                                }
                            }
                        }
                        break;
                }
            } catch (error) {
                console.error('❌ Error procesando línea:', error);
                console.error('Línea problemática:', line);
                results.errors++;
            }
        }

        console.log(`✅ Procesados: ${results.employeesRegistered} empleados registrados, ${results.employeesUpdated} actualizados, ${results.invoicesProcessed} facturas, ${results.inventoryProcessed} movimientos inventario`);
        return results;
    }

    // Método auxiliar para extraer nombres (si es necesario)
    extractNameFromPayer(payerName, dni) {
        if (!payerName) return null;
        // Lógica para extraer nombre limpio del pagador
        return payerName.replace(/\*+/g, '').trim();
    }
}

module.exports = MessageParser;