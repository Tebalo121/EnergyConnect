const { MongoClient } = require('mongodb');
const ModelTrainer = require('../modelTrainer');
require('dotenv').config();

async function comprehensiveTest() {
    const client = new MongoClient(process.env.MONGODB_URI);
    
    try {
        await client.connect();
        const db = client.db();
        
        console.log('🧪 Starting Comprehensive AI Test...\n');
        
        const trainer = new ModelTrainer(db);
        
        // Test 1: Generate Dataset
        console.log('1. Testing Dataset Generation...');
        const dataset = await trainer.datasetGenerator.generateComprehensiveDataset(100);
        console.log(`   ✅ Generated ${dataset.length} records\n`);
        
        // Test 2: Train Models
        console.log('2. Testing Model Training...');
        const trainingResults = await trainer.trainAllModels(500);
        console.log(`   ✅ Models trained. Best: ${trainingResults.bestModel}\n`);
        
        // Test 3: Make Prediction
        console.log('3. Testing Prediction...');
        const prediction = trainer.predict({
            temperature: 25,
            hourOfDay: 19,
            householdSize: 4,
            humidity: 60,
            isWeekend: false,
            hasSolar: false
        });
        console.log(`   ✅ Prediction: ${prediction.predictedEnergy} kWh\n`);
        
        // Test 4: Plan Recommendation
        console.log('4. Testing Plan Recommendation...');
        const sampleHistory = dataset.slice(0, 30);
        const recommendation = trainer.recommendPlan(
            { income: 'Medium', hasSolar: false },
            sampleHistory
        );
        console.log(`   ✅ Recommended: ${recommendation.recommendedPlan.plan}\n`);
        
        // Test 5: Pattern Analysis
        console.log('5. Testing Pattern Analysis...');
        const patterns = trainer.analyzePatterns(dataset);
        console.log(`   ✅ Analyzed ${Object.keys(patterns).length} pattern types\n`);
        
        console.log('🎊 All AI tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await client.close();
    }
}

comprehensiveTest();