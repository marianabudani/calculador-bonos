const fs = require('fs').promises;
const Employee = require('../models/Employee');
const WeeklyData = require('../models/WeeklyData');

class DataManager {
    constructor(bot) {
        this.bot = bot;
    }

    async loadData() {
        try {
            const data = await fs.readFile(this.bot.config.dataFile, 'utf8');
            const parsedData = JSON.parse(data);
            
            this.bot.bonusPercentage = parsedData.bonusPercentage || 10;
            this.bot.currentWeek = parsedData.currentWeek || this.bot.getCurrentWeekKey();
            
            // Cargar empleados correctamente como instancias de Employee
            this.bot.employees.clear();
            for (const [dni, employeeData] of Object.entries(parsedData.employees || {})) {
                try {
                    const employee = Employee.fromJSON(employeeData);
                    this.bot.employees.set(dni, employee);
                } catch (error) {
                    console.error(`❌ Error cargando empleado ${dni}:`, error);
                    // Crear un empleado básico si hay error en la conversión
                    const employee = new Employee(dni, employeeData.name || `Empleado ${dni}`);
                    this.bot.employees.set(dni, employee);
                }
            }
            
            console.log('💾 Datos cargados correctamente');
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('📁 No se encontró archivo de datos, iniciando con datos vacíos');
            } else {
                console.error('❌ Error al cargar datos:', error);
            }
        }
    }

    async saveData() {
        try {
            // Convertir el Map a un objeto para serialización
            const employeesObject = {};
            for (const [dni, employee] of this.bot.employees) {
                employeesObject[dni] = employee.toJSON();
            }
            
            const data = {
                employees: employeesObject,
                bonusPercentage: this.bot.bonusPercentage,
                currentWeek: this.bot.currentWeek,
                savedAt: new Date().toISOString()
            };
            
            await fs.writeFile(this.bot.config.dataFile, JSON.stringify(data, null, 2));
            console.log('💾 Datos guardados correctamente');
        } catch (error) {
            console.error('❌ Error al guardar datos:', error);
        }
    }

    registerEmployee(dni, name) {
        if (!this.bot.employees.has(dni)) {
            const employee = new Employee(dni, name);
            this.bot.employees.set(dni, employee);
            console.log(`👤 Empleado registrado: ${name} (${dni})`);
            return employee;
        }
        return this.bot.employees.get(dni);
    }

    getEmployee(dni) {
        return this.bot.employees.get(dni);
    }

    getAllEmployees() {
        return Array.from(this.bot.employees.values());
    }

    // Método para reparar empleados que no son instancias de Employee
    repairEmployees() {
        let repairedCount = 0;
        
        for (const [dni, employee] of this.bot.employees) {
            if (!(employee instanceof Employee)) {
                // Convertir objeto plano a instancia de Employee
                const newEmployee = new Employee(dni, employee.name || `Empleado ${dni}`);
                
                // Convertir weeklyData si existe
                if (employee.weeklyData) {
                    for (const [weekKey, weekData] of Object.entries(employee.weeklyData)) {
                        const weeklyData = new WeeklyData();
                        weeklyData.invoices = weekData.invoices || [];
                        weeklyData.totalPaid = weekData.totalPaid || 0;
                        newEmployee.weeklyData.set(weekKey, weeklyData);
                    }
                }
                
                this.bot.employees.set(dni, newEmployee);
                repairedCount++;
                console.log(`🔧 Empleado reparado: ${newEmployee.name} (${dni})`);
            }
        }
        
        return repairedCount;
    }
    async forceSyncFromScan() {
    let syncedCount = 0;
    let invoiceCount = 0;
    
    // Esta función asume que los datos del escaneo están en this.bot.channelScanner.lastScanData
    if (!this.bot.channelScanner.lastScanData) {
        return { syncedCount: 0, invoiceCount: 0 };
    }
    
    const bonusData = this.bot.channelScanner.lastScanData;
    
    for (const [dni, employeeData] of bonusData.employeeBonuses) {
        let employee = this.getEmployee(dni);
        if (!employee) {
            employee = this.registerEmployee(dni, employeeData.name);
            syncedCount++;
        } else if (employee.name.startsWith('Empleado ') && !employeeData.name.startsWith('Empleado ')) {
            employee.name = employeeData.name;
            syncedCount++;
        }
        
        for (const [weekKey, weekScanData] of employeeData.weeks) {
            const weekData = employee.getWeekData(weekKey);
            
            for (const invoice of weekScanData.invoices) {
                const exists = weekData.invoices.some(existingInvoice =>
                    existingInvoice.amount === invoice.amount &&
                    existingInvoice.status === invoice.status
                );
                
                if (!exists) {
                    weekData.invoices.push(invoice);
                    invoiceCount++;
                    
                    if (invoice.status === 'paid') {
                        weekData.totalPaid += invoice.amount;
                    }
                }
            }
        }
    }
    
    if (syncedCount > 0 || invoiceCount > 0) {
        await this.saveData();
        console.log(`🔄 Sincronización forzada: ${syncedCount} empleados, ${invoiceCount} facturas`);
    }
    
    return { syncedCount, invoiceCount };
}
}

module.exports = DataManager;