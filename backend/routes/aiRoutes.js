const express = require('express');
const router = express.Router();
const ModelTrainer = require('../ai/modelTrainer');
const DatasetGenerator = require('../ai/datasetGenerator');

// Initialize model trainer
let modelTrainer;

// Initialize with database connection
router.use(async (req, res, next) => {
    if (!modelTrainer) {
        modelTrainer = new ModelTrainer(req.db);
    }
    next();
});

// Train models endpoint
router.post('/train-models', async (req, res) => {
    try {
        const { datasetSize = 5000 } = req.body;
        
        const results = await modelTrainer.trainAllModels(datasetSize);
        
        res.json({
            success: true,
            message: 'Models trained successfully',
            results: results
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get training status
router.get('/training-status', async (req, res) => {
    try {
        const status = await modelTrainer.getTrainingStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Make prediction
router.post('/predict', async (req, res) => {
    try {
        const { temperature, hourOfDay, householdSize, humidity = 50, isWeekend = false, hasSolar = false, modelType = 'linear' } = req.body;

        const prediction = modelTrainer.predict({
            temperature: parseFloat(temperature),
            hourOfDay: parseInt(hourOfDay),
            householdSize: parseInt(householdSize),
            humidity: parseFloat(humidity),
            isWeekend: Boolean(isWeekend),
            hasSolar: Boolean(hasSolar)
        }, modelType);

        res.json({
            success: true,
            prediction: prediction,
            timestamp: new Date()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get plan recommendation
router.post('/recommend-plan', async (req, res) => {
    try {
        const { customerData, usageHistory } = req.body;

        const recommendation = modelTrainer.recommendPlan(customerData, usageHistory);

        res.json({
            success: true,
            recommendation: recommendation
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Generate dataset
router.post('/generate-dataset', async (req, res) => {
    try {
        const { records = 1000 } = req.body;
        
        const generator = new DatasetGenerator(req.db);
        const dataset = await generator.generateComprehensiveDataset(records);
        const saveResult = await generator.saveDataset(dataset);
        const stats = await generator.getDatasetStats();

        res.json({
            success: true,
            recordsGenerated: saveResult.insertedCount,
            datasetStats: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get dataset statistics
router.get('/dataset-stats', async (req, res) => {
    try {
        const generator = new DatasetGenerator(req.db);
        const stats = await generator.getDatasetStats();
        
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get consumption patterns
router.get('/consumption-patterns', async (req, res) => {
    try {
        const dataset = await req.db.collection('ai_energy_dataset')
            .find({})
            .limit(1000)
            .toArray();

        const patterns = modelTrainer.analyzePatterns(dataset);

        res.json({
            success: true,
            patterns: patterns
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// AI Dashboard data
router.get('/dashboard-data', async (req, res) => {
    try {
        const [dataset, trainingStatus, patterns] = await Promise.all([
            req.db.collection('ai_energy_dataset').find({}).limit(500).toArray(),
            modelTrainer.getTrainingStatus(),
            req.db.collection('ai_energy_dataset').find({}).limit(1000).toArray()
        ]);

        const dashboardData = {
            trainingStatus: trainingStatus,
            datasetSize: dataset.length,
            patterns: modelTrainer.analyzePatterns(patterns),
            recentPredictions: dataset.slice(-10).map(d => ({
                timestamp: d.timestamp,
                actual: d.energyConsumptionKwh,
                predicted: modelTrainer.predict({
                    temperature: d.temperature,
                    hourOfDay: d.hourOfDay,
                    householdSize: d.householdSize
                }).predictedEnergy
            }))
        };

        res.json(dashboardData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;