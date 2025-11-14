const { ObjectId } = require('mongodb');

class DatasetGenerator {
    constructor(db) {
        this.db = db;
    }

    async generateComprehensiveDataset(numRecords = 5000) {
        console.log('🚀 Generating comprehensive energy dataset...');
        
        const dataset = [];
        const customerIds = await this.getCustomerIds();
        const plans = await this.getEnergyPlans();
        
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 2); // 2 years of data

        for (let i = 0; i < numRecords; i++) {
            const randomCustomer = customerIds[Math.floor(Math.random() * customerIds.length)];
            const randomPlan = plans[Math.floor(Math.random() * plans.length)];
            const timestamp = this.randomDate(startDate, endDate);
            const hour = timestamp.getHours();
            
            // Safe access to plan properties with fallbacks
            const planType = randomPlan?.planType || this.getFallbackPlanType(i);
            const planCost = randomPlan?.costPerKwh || this.getFallbackPlanCost(planType);
            
            const record = {
                _id: new ObjectId(),
                customerId: randomCustomer._id,
                customerAge: this.randomAge(),
                customerIncome: this.randomIncome(),
                timestamp: timestamp,
                energyConsumptionKwh: this.calculateEnergyUsage(hour, randomCustomer),
                temperature: this.randomTemperature(timestamp.getMonth()),
                humidity: 30 + Math.random() * 70,
                dayOfWeek: timestamp.getDay(),
                hourOfDay: hour,
                month: timestamp.getMonth(),
                season: this.getSeason(timestamp.getMonth()),
                isHoliday: Math.random() > 0.95,
                isWeekend: [0, 6].includes(timestamp.getDay()),
                planType: planType, // Using safe access
                planCost: planCost, // Using safe access
                location: randomCustomer.location || this.randomLocation(),
                householdSize: Math.floor(Math.random() * 6) + 1,
                homeSize: this.randomHomeSize(),
                hasSolar: Math.random() > 0.85,
                hasElectricVehicle: Math.random() > 0.7,
                peakHours: this.isPeakHour(hour),
                cost: 0, // Will be calculated
                carbonFootprint: 0, // Will be calculated
                createdAt: new Date()
            };

            // Calculate derived fields
            record.cost = parseFloat((record.energyConsumptionKwh * record.planCost).toFixed(2));
            record.carbonFootprint = parseFloat((record.energyConsumptionKwh * 0.5).toFixed(2)); // 0.5kg CO2 per kWh
            
            dataset.push(record);
        }

        console.log(`✅ Generated ${dataset.length} comprehensive records`);
        return dataset;
    }

    calculateEnergyUsage(hour, customer) {
        let baseUsage;
        
        // Time-based patterns
        if (this.isPeakHour(hour)) {
            baseUsage = 25 + Math.random() * 30; // High usage during peak
        } else if (hour >= 0 && hour <= 6) {
            baseUsage = 5 + Math.random() * 10; // Low usage overnight
        } else {
            baseUsage = 15 + Math.random() * 20; // Medium usage
        }

        // Customer behavior factors
        if (customer.hasSolar) baseUsage *= 0.6;
        if (customer.hasElectricVehicle) baseUsage *= 1.4;
        if (customer.homeSize === 'Large') baseUsage *= 1.3;
        if (customer.homeSize === 'Small') baseUsage *= 0.8;

        return parseFloat(baseUsage.toFixed(2));
    }

    randomAge() {
        const ages = [25, 30, 35, 40, 45, 50, 55, 60, 65];
        return ages[Math.floor(Math.random() * ages.length)];
    }

    randomIncome() {
        const incomes = ['Low', 'Medium', 'High'];
        return incomes[Math.floor(Math.random() * incomes.length)];
    }

    randomLocation() {
        const locations = ['Urban', 'Suburban', 'Rural'];
        return locations[Math.floor(Math.random() * locations.length)];
    }

    randomHomeSize() {
        const sizes = ['Small', 'Medium', 'Large'];
        return sizes[Math.floor(Math.random() * sizes.length)];
    }

    randomDate(start, end) {
        return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    }

    randomTemperature(month) {
        // Seasonal temperature variations
        const baseTemps = [5, 8, 12, 18, 23, 28, 30, 29, 25, 18, 12, 7]; // Monthly averages
        const variation = (Math.random() - 0.5) * 10; // ±5 degrees
        return parseFloat((baseTemps[month] + variation).toFixed(1));
    }

    getSeason(month) {
        if (month >= 2 && month <= 4) return 'Spring';
        if (month >= 5 && month <= 7) return 'Summer';
        if (month >= 8 && month <= 10) return 'Autumn';
        return 'Winter';
    }

    isPeakHour(hour) {
        return (hour >= 17 && hour <= 21) || (hour >= 7 && hour <= 9);
    }

    // Fallback plan type based on index
    getFallbackPlanType(index) {
        const planTypes = ['Basic', 'Standard', 'Premium', 'Green'];
        return planTypes[index % planTypes.length];
    }

    // Fallback plan cost based on plan type
    getFallbackPlanCost(planType) {
        const planCosts = {
            'Basic': 0.12,
            'Standard': 0.15,
            'Premium': 0.18,
            'Green': 0.20
        };
        return planCosts[planType] || 0.15;
    }

    async getCustomerIds() {
        try {
            const customers = await this.db.collection('users')
                .find({ role: 'customer' })
                .project({ _id: 1, location: 1 })
                .limit(100)
                .toArray();
            
            // Enhance with synthetic attributes for demo
            return customers.map(customer => ({
                ...customer,
                hasSolar: Math.random() > 0.8,
                hasElectricVehicle: Math.random() > 0.7,
                homeSize: this.randomHomeSize()
            }));
        } catch (error) {
            console.log('⚠️ No customers found, using mock customers');
            // Return mock customer data
            return Array.from({ length: 10 }, (_, i) => ({
                _id: new ObjectId(),
                location: this.randomLocation(),
                hasSolar: Math.random() > 0.8,
                hasElectricVehicle: Math.random() > 0.7,
                homeSize: this.randomHomeSize()
            }));
        }
    }

    async getEnergyPlans() {
        try {
            const plans = await this.db.collection('energy_plans')
                .find({})
                .project({ planType: 1, costPerKwh: 1 })
                .limit(10)
                .toArray();

            // Validate plans have required fields
            const validPlans = plans.filter(plan => plan && plan.planType);
            
            if (validPlans.length === 0) {
                console.log('⚠️ No valid energy plans found, using default plans');
                return this.getDefaultPlans();
            }

            console.log(`📊 Found ${validPlans.length} energy plans`);
            return validPlans;

        } catch (error) {
            console.log('⚠️ Error fetching energy plans, using defaults:', error.message);
            return this.getDefaultPlans();
        }
    }

    getDefaultPlans() {
        return [
            { planType: 'Basic', costPerKwh: 0.12 },
            { planType: 'Standard', costPerKwh: 0.15 },
            { planType: 'Premium', costPerKwh: 0.18 },
            { planType: 'Green', costPerKwh: 0.20 }
        ];
    }

    async saveDataset(dataset, collectionName = 'ai_energy_dataset') {
        try {
            await this.db.collection(collectionName).deleteMany({});
            const result = await this.db.collection(collectionName).insertMany(dataset);
            console.log(`💾 Dataset saved to ${collectionName}: ${result.insertedCount} records`);
            return result;
        } catch (error) {
            console.error('❌ Error saving dataset:', error);
            throw error;
        }
    }

    async getDatasetStats(collectionName = 'ai_energy_dataset') {
        try {
            const stats = await this.db.collection(collectionName).aggregate([
                {
                    $group: {
                        _id: null,
                        totalRecords: { $sum: 1 },
                        avgConsumption: { $avg: '$energyConsumptionKwh' },
                        avgCost: { $avg: '$cost' },
                        minConsumption: { $min: '$energyConsumptionKwh' },
                        maxConsumption: { $max: '$energyConsumptionKwh' },
                        uniqueCustomers: { $addToSet: '$customerId' }
                    }
                },
                {
                    $project: {
                        totalRecords: 1,
                        avgConsumption: { $round: ['$avgConsumption', 2] },
                        avgCost: { $round: ['$avgCost', 2] },
                        minConsumption: 1,
                        maxConsumption: 1,
                        uniqueCustomers: { $size: '$uniqueCustomers' }
                    }
                }
            ]).toArray();

            return stats[0] || {};
        } catch (error) {
            console.error('Error getting dataset stats:', error);
            return {};
        }
    }

    // Generate a small test dataset for quick testing
    async generateTestDataset(numRecords = 100) {
        console.log('🧪 Generating test dataset...');
        const dataset = await this.generateComprehensiveDataset(numRecords);
        console.log(`✅ Generated ${dataset.length} test records`);
        return dataset;
    }
}

module.exports = DatasetGenerator;