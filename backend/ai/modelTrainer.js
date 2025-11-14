const DatasetGenerator = require('./datasetGenerator');
const EnergyPredictionModel = require('./predictionModel');
const NeuralNetworkModel = require('./neuralNetwork');
const NeuralNetworkSimulation = require('./neuralNetwork');

class ModelTrainer {
    constructor(db) {
        this.db = db;
        this.datasetGenerator = new DatasetGenerator(db);
        this.linearModel = new EnergyPredictionModel();
        this.neuralNetwork = new NeuralNetworkSimulation();
        this.trainingStatus = 'idle';
    }

    async trainAllModels(datasetSize = 5000) {
        try {
            this.trainingStatus = 'training';
            console.log('🎯 Starting comprehensive model training...');

            // Generate dataset
            const dataset = await this.datasetGenerator.generateComprehensiveDataset(datasetSize);
            await this.datasetGenerator.saveDataset(dataset);

            // Train linear model
            console.log('\n--- Training Linear Model ---');
            const linearResults = await this.linearModel.trainEnsembleModel(dataset);

            // Train neural network
            console.log('\n--- Training Neural Network ---');
            this.neuralNetwork.createModel(6); // 6 features
            await this.neuralNetwork.trainModel(dataset);
            const nnResults = await this.neuralNetwork.evaluateModel(dataset.slice(0, 1000));

            // Compare models
            const comparison = {
                linear: linearResults,
                neuralNetwork: nnResults,
                bestModel: linearResults.rSquared > (100 - nnResults.mae) / 100 ? 'linear' : 'neural'
            };

            this.trainingStatus = 'completed';
            
            // Save model metadata
            await this.saveModelMetadata(comparison, datasetSize);

            console.log('\n🎊 Model Training Completed!');
            console.log('Best Model:', comparison.bestModel);
            console.log('Linear R²:', linearResults.rSquared);
            console.log('Neural Network MAE:', nnResults.mae);

            return comparison;

        } catch (error) {
            this.trainingStatus = 'failed';
            console.error('❌ Model training failed:', error);
            throw error;
        }
    }

    async saveModelMetadata(comparison, datasetSize) {
        const metadata = {
            trainingDate: new Date(),
            datasetSize: datasetSize,
            modelComparison: comparison,
            linearModel: this.linearModel.getModelSummary(),
            status: this.trainingStatus,
            createdAt: new Date()
        };

        await this.db.collection('ai_model_metadata').deleteMany({});
        await this.db.collection('ai_model_metadata').insertOne(metadata);
        
        console.log('💾 Model metadata saved');
    }

    async getTrainingStatus() {
        const metadata = await this.db.collection('ai_model_metadata')
            .findOne({}, { sort: { trainingDate: -1 } });

        return metadata || {
            status: 'never_trained',
            trainingDate: null,
            datasetSize: 0
        };
    }

    predict(input, modelType = 'linear') {
        if (modelType === 'neural' && this.neuralNetwork.isTrained) {
            return this.neuralNetwork.predict(input);
        } else if (this.linearModel.isTrained) {
            return this.linearModel.predict(input);
        } else {
            throw new Error('No trained model available');
        }
    }

    recommendPlan(customerData, usageHistory) {
        return this.linearModel.recommendOptimalPlan(customerData, usageHistory);
    }

    analyzePatterns(dataset) {
        return this.linearModel.analyzeConsumptionPatterns(dataset);
    }
}

module.exports = ModelTrainer;