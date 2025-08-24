const WeeklyData = require('./WeeklyData');

class Employee {
    constructor(dni, name) {
        this.dni = dni;
        this.name = name;
        this.weeklyData = new Map(); // semanaKey -> WeeklyData
    }

    getWeekData(weekKey) {
        if (!this.weeklyData.has(weekKey)) {
            this.weeklyData.set(weekKey, new WeeklyData());
        }
        return this.weeklyData.get(weekKey);
    }

    getTotalPaid() {
        let total = 0;
        for (const weekData of this.weeklyData.values()) {
            total += weekData.totalPaid;
        }
        return total;
    }

    getPaidInvoices() {
        let paid = [];
        for (const weekData of this.weeklyData.values()) {
            paid = paid.concat(weekData.invoices.filter(inv => inv.status === 'paid'));
        }
        return paid;
    }

    getPendingInvoices() {
        let pending = [];
        for (const weekData of this.weeklyData.values()) {
            pending = pending.concat(weekData.invoices.filter(inv => inv.status === 'sent'));
        }
        return pending;
    }

    toJSON() {
        // Convertir el Map de weeklyData a objeto para serialización
        const weeklyDataObject = {};
        for (const [weekKey, weekData] of this.weeklyData) {
            weeklyDataObject[weekKey] = {
                invoices: weekData.invoices,
                totalPaid: weekData.totalPaid
            };
        }
        
        return {
            dni: this.dni,
            name: this.name,
            weeklyData: weeklyDataObject
        };
    }

    static fromJSON(data) {
        const employee = new Employee(data.dni, data.name);
        
        // Restaurar weeklyData desde objeto a Map
        if (data.weeklyData) {
            for (const [weekKey, weekData] of Object.entries(data.weeklyData)) {
                const weeklyDataInstance = new WeeklyData();
                weeklyDataInstance.invoices = weekData.invoices || [];
                weeklyDataInstance.totalPaid = weekData.totalPaid || 0;
                employee.weeklyData.set(weekKey, weeklyDataInstance);
            }
        }
        
        return employee;
    }
}

module.exports = Employee;