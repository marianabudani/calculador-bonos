class ValidationUtils {
    static isValidDNI(dni) {
        // Formato: 3 letras mayúsculas seguidas de números
        const dniRegex = /^[A-Z]{3}\d+$/;
        return dniRegex.test(dni);
    }

    static isValidPercentage(percentage) {
        const num = parseInt(percentage);
        return !isNaN(num) && num >= 0 && num <= 100;
    }

    static isValidDate(dateStr) {
        // Formato: DD/MM/YYYY
        const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
        if (!dateRegex.test(dateStr)) return false;

        const [day, month, year] = dateStr.split('/').map(Number);
        
        // Validar rangos básicos
        if (month < 1 || month > 12) return false;
        if (day < 1 || day > 31) return false;
        if (year < 2000 || year > 2100) return false;

        // Validar días específicos por mes
        const date = new Date(year, month - 1, day);
        return date.getDate() === day && 
               date.getMonth() === month - 1 && 
               date.getFullYear() === year;
    }

    static isValidDateRange(startDateStr, endDateStr) {
        if (!this.isValidDate(startDateStr) || !this.isValidDate(endDateStr)) {
            return false;
        }

        const [startDay, startMonth, startYear] = startDateStr.split('/').map(Number);
        const [endDay, endMonth, endYear] = endDateStr.split('/').map(Number);

        const startDate = new Date(startYear, startMonth - 1, startDay);
        const endDate = new Date(endYear, endMonth - 1, endDay);

        return startDate <= endDate;
    }

    static isValidChannelId(channelId) {
        // Los IDs de canal de Discord son números de 18-19 dígitos
        const channelIdRegex = /^\d{18,19}$/;
        return channelIdRegex.test(channelId);
    }

    static isValidMessageCount(count) {
        const num = parseInt(count);
        return !isNaN(num) && num > 0 && num <= 1000;
    }

    static isValidWeekKey(weekKey) {
        // Formato: YYYY-WW (ej: 2025-34)
        const weekRegex = /^\d{4}-\d{1,2}$/;
        if (!weekRegex.test(weekKey)) return false;

        const [year, week] = weekKey.split('-').map(Number);
        return year >= 2000 && year <= 2100 && week >= 1 && week <= 53;
    }

    static validateScanArguments(args) {
        const errors = [];

        if (args.length < 3) {
            errors.push('Se requieren fecha de inicio y fecha de fin');
        } else {
            const startDate = args[1];
            const endDate = args[2];

            if (!this.isValidDate(startDate)) {
                errors.push('Formato de fecha de inicio inválido. Use DD/MM/AAAA');
            }

            if (!this.isValidDate(endDate)) {
                errors.push('Formato de fecha de fin inválido. Use DD/MM/AAAA');
            }

            if (this.isValidDate(startDate) && this.isValidDate(endDate) && 
                !this.isValidDateRange(startDate, endDate)) {
                errors.push('La fecha de inicio no puede ser mayor que la fecha de fin');
            }
        }

        return errors;
    }

    static validateSetChannelArguments(args) {
        const errors = [];

        if (args.length < 3) {
            errors.push('Se requieren tipo de canal y ID de canal');
        } else {
            const type = args[1].toLowerCase();
            const channelId = args[2];

            if (!['logs', 'comandos', 'reset'].includes(type)) {
                errors.push('Tipo de canal inválido. Use: logs, comandos o reset');
            }

            if (type !== 'reset' && !this.isValidChannelId(channelId)) {
                errors.push('ID de canal inválido');
            }
        }

        return errors;
    }

    static validateBonusPercentage(percentage) {
        const errors = [];

        if (!percentage) {
            errors.push('Se requiere un porcentaje');
        } else if (!this.isValidPercentage(percentage)) {
            errors.push('Porcentaje inválido. Debe ser un número entre 0 y 100');
        }

        return errors;
    }

    static validateEmployeeDNI(dni) {
        const errors = [];

        if (!dni) {
            errors.push('Se requiere un DNI');
        } else if (!this.isValidDNI(dni)) {
            errors.push('Formato de DNI inválido. Use: ABC123');
        }

        return errors;
    }

    static formatErrorMessages(errors) {
        if (errors.length === 0) return null;
        
        return errors.map(error => `❌ ${error}`).join('\n');
    }

    static sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        
        // Eliminar caracteres potencialmente peligrosos
        return input.replace(/[<>$`\\]/g, '');
    }

    static parseAmount(amountStr) {
        const amount = parseInt(amountStr);
        return isNaN(amount) || amount <= 0 ? null : amount;
    }
}

module.exports = ValidationUtils;