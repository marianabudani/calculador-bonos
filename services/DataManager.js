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

    repairEmployees() {
        let repairedCount = 0;
        
        for (const [dni, employee] of this.bot.employees) {
            if (typeof employee.getWeekData !== 'function') {
                console.log(`🔧 Reparando empleado: ${dni}`);
                
                const newEmployee = new Employee(dni, employee.name || `Empleado ${dni}`);
                
                if (employee.weeklyData) {
                    for (const [weekKey, weekData] of Object.entries(employee.weeklyData)) {
                        const weeklyDataInstance = new WeeklyData();
                        weeklyDataInstance.invoices = weekData.invoices || [];
                        weeklyDataInstance.totalPaid = weekData.totalPaid || 0;
                        newEmployee.weeklyData.set(weekKey, weeklyDataInstance);
                    }
                }
                
                this.bot.employees.set(dni, newEmployee);
                repairedCount++;
            }
        }
        
        return repairedCount;
    }
    async repairEmployeeNames() {
        let repairedCount = 0;
        const webhookChannelId = process.env.CANAL_WEBHOOK;
        
        if (!webhookChannelId) {
            console.log('❌ No se configuró CANAL_WEBHOOK para reparar nombres');
            return 0;
        }
        
        try {
            console.log('🔧 Buscando nombres reales de empleados...');
            
            const channel = await this.bot.client.channels.fetch(webhookChannelId);
            const messages = await channel.messages.fetch({ limit: 200 });
            
            for (const message of messages.values()) {
                if (message.webhookId && this.bot.messageParser.isWebhookLog(message.content)) {
                    const lines = message.content.split('\n');
                    
                    for (const line of lines) {
                        try {
                            const parsed = this.bot.messageParser.parseLine(line.trim());
                            if (parsed && parsed.type === 'service_entry') {
                                const employee = this.getEmployee(parsed.dni);
                                
                                if (employee && employee.name.startsWith('Empleado ') && !parsed.name.startsWith('Empleado')) {
                                    const oldName = employee.name;
                                    employee.name = parsed.name;
                                    repairedCount++;
                                    console.log(`🔧 Nombre reparado: ${oldName} → ${parsed.name} (${parsed.dni})`);
                                }
                                
                                if (!employee && !parsed.name.startsWith('Empleado')) {
                                    this.registerEmployee(parsed.dni, parsed.name);
                                    repairedCount++;
                                    console.log(`🔧 Empleado registrado: ${parsed.name} (${parsed.dni})`);
                                }
                            }
                        } catch (error) {
                            console.error('❌ Error procesando línea:', error);
                        }
                    }
                }
            }
            
            if (repairedCount > 0) {
                await this.saveData();
                console.log(`✅ Reparados ${repairedCount} nombres de empleados`);
            } else {
                console.log('✅ No se encontraron nombres que reparar');
            }
            
            return repairedCount;
            
        } catch (error) {
            console.error('❌ Error en repairEmployeeNames:', error);
            return 0;
        }
    }
}

module.exports = DataManager;