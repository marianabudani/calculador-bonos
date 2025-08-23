class BonusCalculator {
    constructor(bonusPercentage = 10) {
        this.bonusPercentage = bonusPercentage;
    }

    setBonusPercentage(percentage) {
        if (percentage >= 0 && percentage <= 100) {
            this.bonusPercentage = percentage;
            return true;
        }
        return false;
    }

    calculateBonus(amount) {
        return Math.round((amount * this.bonusPercentage) / 100);
    }

    calculateEmployeeBonus(employee, weekKey = null) {
        let totalSales = 0;
        
        if (weekKey) {
            // Calcular para una semana específica
            const weekData = employee.weeklyData.get(weekKey);
            if (weekData) {
                totalSales = weekData.totalPaid;
            }
        } else {
            // Calcular para todas las semanas
            totalSales = Array.from(employee.weeklyData.values())
                .reduce((total, weekData) => total + weekData.totalPaid, 0);
        }
        
        return {
            sales: totalSales,
            bonus: this.calculateBonus(totalSales),
            percentage: this.bonusPercentage
        };
    }

    calculateWeeklyBonuses(employees, weekKey) {
        const results = {
            totalSales: 0,
            totalBonuses: 0,
            employeeBonuses: new Map(),
            employeeCount: 0
        };

        for (const [dni, employee] of employees) {
            const weekData = employee.weeklyData.get(weekKey);
            if (weekData && weekData.totalPaid > 0) {
                const bonus = this.calculateBonus(weekData.totalPaid);
                
                results.employeeBonuses.set(dni, {
                    name: employee.name,
                    sales: weekData.totalPaid,
                    bonus: bonus,
                    paidInvoices: weekData.getPaidInvoices().length
                });
                
                results.totalSales += weekData.totalPaid;
                results.totalBonuses += bonus;
                results.employeeCount++;
            }
        }

        return results;
    }

    calculateHistoricalBonuses(employees, limitWeeks = 4) {
        const results = {
            weeks: new Map(),
            totalSales: 0,
            totalBonuses: 0
        };

        // Obtener todas las semanas únicas
        const allWeeks = new Set();
        for (const employee of employees.values()) {
            for (const weekKey of employee.weeklyData.keys()) {
                allWeeks.add(weekKey);
            }
        }

        // Ordenar semanas y tomar las más recientes
        const sortedWeeks = Array.from(allWeeks).sort().reverse().slice(0, limitWeeks);

        for (const weekKey of sortedWeeks) {
            const weekResult = this.calculateWeeklyBonuses(employees, weekKey);
            if (weekResult.employeeCount > 0) {
                results.weeks.set(weekKey, weekResult);
                results.totalSales += weekResult.totalSales;
                results.totalBonuses += weekResult.totalBonuses;
            }
        }

        return results;
    }

    generateBonusReport(employees, weekKey = null) {
        if (weekKey) {
            return this.calculateWeeklyBonuses(employees, weekKey);
        } else {
            return this.calculateHistoricalBonuses(employees);
        }
    }
}

module.exports = BonusCalculator;