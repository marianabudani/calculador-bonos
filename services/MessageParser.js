class MessageParser {
    constructor(bot) {
        this.bot = bot;
        this.patterns = {
            serviceEntry: /^\*\*\[([A-Z]{3}\d+)\]\s+([^*]+?)\*\*\s+ha entrado en servicio/,
            invoiceSent: /^\*\*\[([A-Z]{3}\d+)\]\*\*\s+ha enviado una factura\s+`\$(\d+)\s+\(([^)]+)\)`/,
            invoicePaid: /^\*\*[^*]+\*\*\s+ha pagado una factura\s+`\$(\d+)\s+\(([^)]+)\)`\s+de\s+\*\*\[([A-Z]{3}\d+)\]\**/
        };
    }

    isWebhookLog(content) {
        return content.includes('[UDT') || 
               content.includes('ha enviado una factura') || 
               content.includes('ha pagado una factura');
    }

    parseLine(line) {
        line = line.trim();
        if (!line) return null;

        const serviceMatch = line.match(this.patterns.serviceEntry);
        if (serviceMatch) {
            const [, dni, name] = serviceMatch;
            return { type: 'service_entry', dni, name: name.trim().replace(/\*+/g, '') };
        }

        const invoiceMatch = line.match(this.patterns.invoiceSent);
        if (invoiceMatch) {
            const [, dni, amount] = invoiceMatch;
            return { type: 'invoice_sent', dni, amount: parseInt(amount) };
        }

        const paidMatch = line.match(this.patterns.invoicePaid);
        if (paidMatch) {
            const [, amount, , dni] = paidMatch;
            return { type: 'invoice_paid', dni, amount: parseInt(amount) };
        }

        return null;
    }

    async processWebhookLog(logContent, dataManager, weekKey) {
    const lines = logContent.split('\n');
    const results = {
        employeesRegistered: 0,
        employeesUpdated: 0,
        invoicesProcessed: 0,
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
                    
                    // Usar el método de la instancia Employee
                    const weekDataSent = employeeSent.getWeekData(weekKey);
                    weekDataSent.addInvoice(parsed.amount, 'sent');
                    results.invoicesProcessed++;
                    break;

                case 'invoice_paid':
                    let employeePaid = dataManager.getEmployee(parsed.dni);
                    
                    // Si el empleado no existe, crearlo
                    if (!employeePaid) {
                        // Intentar extraer el nombre del pagador
                        const extractedName = this.extractNameFromPayer(parsed.payerName, parsed.dni);
                        employeePaid = dataManager.registerEmployee(
                            parsed.dni, 
                            extractedName || `Empleado ${parsed.dni}`
                        );
                        results.employeesRegistered++;
                    } 
                    // Si el empleado existe pero tiene nombre genérico, intentar actualizarlo
                    else if (employeePaid.name.startsWith('Empleado ') && parsed.payerName) {
                        const extractedName = this.extractNameFromPayer(parsed.payerName, parsed.dni);
                        if (extractedName) {
                            employeePaid.name = extractedName;
                            results.employeesUpdated++;
                            console.log(`🔄 Nombre actualizado: ${employeePaid.name} (${parsed.dni})`);
                        }
                    }

                    // Usar el método de la instancia Employee
                    const weekDataPaid = employeePaid.getWeekData(weekKey);
                    if (!weekDataPaid.markInvoiceAsPaid(parsed.amount)) {
                        weekDataPaid.addInvoice(parsed.amount, 'paid');
                    }
                    results.invoicesProcessed++;
                    break;
            }
        } catch (error) {
            console.error('❌ Error procesando línea:', error);
            console.error('Línea problemática:', line);
            results.errors++;
        }
    }

        console.log(`✅ Procesados: ${results.employeesRegistered} empleados registrados, ${results.employeesUpdated} actualizados, ${results.invoicesProcessed} facturas`);
        return results;
    }
}

module.exports = MessageParser;