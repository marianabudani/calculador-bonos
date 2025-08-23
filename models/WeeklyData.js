class WeeklyData {
    constructor() {
        this.invoices = [];
        this.totalPaid = 0;
    }

    addInvoice(amount, status = 'sent', timestamp = new Date()) {
        this.invoices.push({
            amount,
            status,
            timestamp
        });

        if (status === 'paid') {
            this.totalPaid += amount;
        }
    }

    markInvoiceAsPaid(amount) {
        const pendingInvoice = this.invoices.find(inv => 
            inv.amount === amount && inv.status === 'sent'
        );

        if (pendingInvoice) {
            pendingInvoice.status = 'paid';
            this.totalPaid += amount;
            return true;
        }
        return false;
    }

    getPaidInvoices() {
        return this.invoices.filter(inv => inv.status === 'paid');
    }

    getPendingInvoices() {
        return this.invoices.filter(inv => inv.status === 'sent');
    }

    toJSON() {
        return {
            invoices: this.invoices,
            totalPaid: this.totalPaid
        };
    }

    static fromJSON(data) {
        const weeklyData = new WeeklyData();
        weeklyData.invoices = data.invoices || [];
        weeklyData.totalPaid = data.totalPaid || 0;
        return weeklyData;
    }
}

module.exports = WeeklyData;