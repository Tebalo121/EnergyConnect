const regression = require('regression');

class EnergyPredictionModel {
    constructor() {
        this.linearModel = null;
        this.isTrained = false;
        this.accuracyMetrics = {};
        this.featureImportance = {};
    }

    // Train multiple models and select the best one
    async trainEnsembleModel(dataset) {
        console.log('🎯 Training ensemble model...');
        
        const results = {
            linear: this.trainLinearModel(dataset),
            polynomial: this.trainPolynomialModel(dataset)
        };

        // Evaluate all models
        const evaluations = [];
        for (const [name, model] of Object.entries(results)) {
            if (model) {
                const evaluation = this.evaluateModel(model, dataset, name);
                evaluations.push({ name, ...evaluation });
            }
        }

        // Select best model based on R² score
        const bestModel = evaluations.reduce((best, current) => 
            current.rSquared > best.rSquared ? current : best
        );

        this.linearModel = results[bestModel.name];
        this.isTrained = true;
        this.accuracyMetrics = bestModel;

        console.log(`✅ Best model: ${bestModel.name} (R²: ${bestModel.rSquared.toFixed(3)})`);
        return bestModel;
    }

    trainLinearModel(dataset) {
        const data = dataset.map(record => [
            record.temperature,
            record.hourOfDay,
            record.householdSize,
            record.energyConsumptionKwh
        ]);

        const result = regression.linear(data.map(d => [d[0], d[1], d[2], d[3]]));
        
        this.featureImportance = {
            temperature: Math.abs(result.equation[0]),
            hourOfDay: Math.abs(result.equation[1]),
            householdSize: Math.abs(result.equation[2])
        };

        return result;
    }

    trainPolynomialModel(dataset, order = 2) {
        try {
            const data = dataset.map(record => [
                record.temperature,
                record.hourOfDay,
                record.energyConsumptionKwh
            ]);

            const result = regression.polynomial(data.map(d => [d[0], d[1], d[2]]), { order });
            return result;
        } catch (error) {
            console.log('Polynomial regression failed, using linear instead');
            return this.trainLinearModel(dataset);
        }
    }

    evaluateModel(model, dataset, modelName) {
        let predictions = [];
        let actuals = [];

        dataset.forEach(record => {
            const prediction = this.predictWithModel(model, {
                temperature: record.temperature,
                hourOfDay: record.hourOfDay,
                householdSize: record.householdSize
            }, modelName);

            if (prediction) {
                predictions.push(prediction.predictedEnergy);
                actuals.push(record.energyConsumptionKwh);
            }
        });

        // Calculate metrics
        const mse = this.calculateMSE(predictions, actuals);
        const mae = this.calculateMAE(predictions, actuals);
        const rSquared = this.calculateRSquared(predictions, actuals);

        return {
            mse: parseFloat(mse.toFixed(4)),
            mae: parseFloat(mae.toFixed(4)),
            rSquared: parseFloat(rSquared.toFixed(4)),
            accuracy: parseFloat((rSquared * 100).toFixed(2))
        };
    }

    predictWithModel(model, input, modelType = 'linear') {
        try {
            const { temperature, hourOfDay, householdSize } = input;
            let prediction;

            switch (modelType) {
                case 'polynomial':
                    prediction = model.predict([temperature, hourOfDay]);
                    break;
                default: // linear
                    prediction = model.predict([temperature, hourOfDay, householdSize]);
            }

            return {
                predictedEnergy: parseFloat(prediction[1].toFixed(2)),
                confidence: Math.min(0.95, model.r2 + 0.3)
            };
        } catch (error) {
            return null;
        }
    }

    predict(input) {
        if (!this.isTrained) {
            throw new Error('Model not trained. Call trainEnsembleModel first.');
        }

        return this.predictWithModel(this.linearModel, input, this.accuracyMetrics.name);
    }

    calculateMSE(predictions, actuals) {
        const squaredErrors = predictions.map((pred, i) => Math.pow(pred - actuals[i], 2));
        return squaredErrors.reduce((sum, error) => sum + error, 0) / predictions.length;
    }

    calculateMAE(predictions, actuals) {
        const absoluteErrors = predictions.map((pred, i) => Math.abs(pred - actuals[i]));
        return absoluteErrors.reduce((sum, error) => sum + error, 0) / predictions.length;
    }

    calculateRSquared(predictions, actuals) {
        const actualMean = actuals.reduce((sum, val) => sum + val, 0) / actuals.length;
        const totalSumSquares = actuals.reduce((sum, val) => sum + Math.pow(val - actualMean, 2), 0);
        const residualSumSquares = predictions.reduce((sum, pred, i) => sum + Math.pow(pred - actuals[i], 2), 0);
        
        return 1 - (residualSumSquares / totalSumSquares);
    }

    // Smart plan recommendations with cost analysis
    recommendOptimalPlan(customerData, usageHistory) {
        const avgUsage = usageHistory.reduce((sum, record) => sum + record.energyConsumptionKwh, 0) / usageHistory.length;
        const peakUsage = Math.max(...usageHistory.map(r => r.energyConsumptionKwh));
        
        const plans = [
            { name: 'Basic', rate: 0.12, fixed: 10, maxUsage: 30 },
            { name: 'Standard', rate: 0.15, fixed: 5, maxUsage: 50 },
            { name: 'Premium', rate: 0.18, fixed: 0, maxUsage: 100 },
            { name: 'Green', rate: 0.20, fixed: 8, maxUsage: 40 }
        ];

        // Calculate costs for each plan
        const planAnalysis = plans.map(plan => {
            const monthlyCost = (avgUsage * plan.rate) + plan.fixed;
            const savings = this.calculatePotentialSavings(plan, usageHistory, customerData);
            
            return {
                plan: plan.name,
                monthlyCost: parseFloat(monthlyCost.toFixed(2)),
                suitability: this.calculateSuitability(plan, avgUsage, peakUsage, customerData),
                savingsPotential: savings,
                recommendation: avgUsage <= plan.maxUsage ? 'Compatible' : 'Over Usage'
            };
        });

        // Sort by suitability and cost
        const bestPlan = planAnalysis.sort((a, b) => 
            b.suitability - a.suitability || a.monthlyCost - b.monthlyCost
        )[0];

        return {
            currentUsage: parseFloat(avgUsage.toFixed(2)),
            recommendedPlan: bestPlan,
            allOptions: planAnalysis,
            reasoning: this.generateRecommendationReasoning(bestPlan, avgUsage)
        };
    }

    calculateSuitability(plan, avgUsage, peakUsage, customerData) {
        let score = 0;
        
        // Usage compatibility (40% weight)
        if (avgUsage <= plan.maxUsage) score += 40;
        else score += Math.max(0, 40 - (avgUsage - plan.maxUsage));
        
        // Cost efficiency (30% weight)
        const expectedCost = (avgUsage * plan.rate) + plan.fixed;
        score += Math.max(0, 30 - (expectedCost / 10));
        
        // Customer preferences (30% weight)
        if (customerData.hasSolar && plan.name === 'Green') score += 30;
        if (customerData.income === 'High' && plan.name === 'Premium') score += 20;
        if (customerData.income === 'Low' && plan.name === 'Basic') score += 20;
        
        return Math.min(100, score);
    }

    calculatePotentialSavings(plan, usageHistory, customerData) {
        const currentAvgCost = usageHistory.reduce((sum, r) => sum + r.cost, 0) / usageHistory.length;
        const newCost = (this.getAverageUsage(usageHistory) * plan.rate) + plan.fixed;
        
        return parseFloat((currentAvgCost - newCost).toFixed(2));
    }

    getAverageUsage(usageHistory) {
        return usageHistory.reduce((sum, r) => sum + r.energyConsumptionKwh, 0) / usageHistory.length;
    }

    generateRecommendationReasoning(plan, avgUsage) {
        const reasons = [];
        
        if (plan.savingsPotential > 0) {
            reasons.push(`Potential savings of $${plan.savingsPotential} per month`);
        }
        
        if (avgUsage <= 30) {
            reasons.push('Low consumption pattern matches basic plans');
        } else if (avgUsage <= 50) {
            reasons.push('Medium consumption suitable for standard plans');
        } else {
            reasons.push('High consumption requires premium unlimited plan');
        }
        
        if (plan.plan === 'Green') {
            reasons.push('Environmentally friendly option');
        }
        
        return reasons.join('. ');
    }
}

module.exports = EnergyPredictionModel;