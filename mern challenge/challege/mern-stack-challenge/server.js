const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(bodyParser.json());
app.use(cors());

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/mern_stack_challenge', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch((err) => {
    console.error('Failed to connect to MongoDB', err);
});

const productTransactionSchema = new mongoose.Schema({
    id: Number,
    title: String,
    description: String,
    price: Number,
    dateOfSale: Date,
    category: String,
    sold: Boolean
});

const ProductTransaction = mongoose.model('ProductTransaction', productTransactionSchema);

app.get('/api/init', async (req, res) => {
    try {
        const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
        const data = response.data;

        await ProductTransaction.deleteMany({});
        await ProductTransaction.insertMany(data);

        res.status(200).send('Database initialized with seed data');
    } catch (error) {
        res.status(500).send('Error initializing database');
    }
});


app.get('/api/transactions', async (req, res) => {
    const { month, search = '', page = 1, perPage = 10 } = req.query;
    const regex = new RegExp(search, 'i');

    const startDate = new Date(`${month}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    try {
        const transactions = await ProductTransaction.find({
            dateOfSale: { $gte: startDate, $lt: endDate },
            $or: [
                { title: regex },
                { description: regex },
                { price: parseFloat(search) || -1 }
            ]
        })
        .skip((page - 1) * perPage)
        .limit(parseInt(perPage));

        const total = await ProductTransaction.countDocuments({
            dateOfSale: { $gte: startDate, $lt: endDate },
            $or: [
                { title: regex },
                { description: regex },
                { price: parseFloat(search) || -1 }
            ]
        });

        res.status(200).json({ transactions, total });
    } catch (error) {
        res.status(500).send('Error fetching transactions');
    }
});

app.get('/api/statistics', async (req, res) => {
    const { month } = req.query;

    const startDate = new Date(`${month}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    try {
        const totalSaleAmount = await ProductTransaction.aggregate([
            { $match: { dateOfSale: { $gte: startDate, $lt: endDate }, sold: true } },
            { $group: { _id: null, total: { $sum: "$price" } } }
        ]);

        const totalSoldItems = await ProductTransaction.countDocuments({
            dateOfSale: { $gte: startDate, $lt: endDate },
            sold: true
        });

        const totalNotSoldItems = await ProductTransaction.countDocuments({
            dateOfSale: { $gte: startDate, $lt: endDate },
            sold: false
        });

        res.status(200).json({
            totalSaleAmount: totalSaleAmount[0]?.total || 0,
            totalSoldItems,
            totalNotSoldItems
        });
    } catch (error) {
        res.status(500).send('Error fetching statistics');
    }
});

app.get('/api/bar-chart', async (req, res) => {
    const { month } = req.query;

    const startDate = new Date(`${month}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const priceRanges = [
        { range: '0-100', min: 0, max: 100 },
        { range: '101-200', min: 101, max: 200 },
        { range: '201-300', min: 201, max: 300 },
        { range: '301-400', min: 301, max: 400 },
        { range: '401-500', min: 401, max: 500 },
        { range: '501-600', min: 501, max: 600 },
        { range: '601-700', min: 601, max: 700 },
        { range: '701-800', min: 701, max: 800 },
        { range: '801-900', min: 801, max: 900 },
        { range: '901-above', min: 901, max: Infinity }
    ];

    try {
        const barChartData = await Promise.all(priceRanges.map(async range => {
            const count = await ProductTransaction.countDocuments({
                dateOfSale: { $gte: startDate, $lt: endDate },
                price: { $gte: range.min, $lt: range.max }
            });
            return { range: range.range, count };
        }));

        res.status(200).json(barChartData);
    } catch (error) {
        res.status(500).send('Error fetching bar chart data');
    }
});

app.get('/api/pie-chart', async (req, res) => {
    const { month } = req.query;

    const startDate = new Date(`${month}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    try {
        const pieChartData = await ProductTransaction.aggregate([
            { $match: { dateOfSale: { $gte: startDate, $lt: endDate } } },
            { $group: { _id: "$category", count: { $sum: 1 } } },
            { $project: { _id: 0, category: "$_id", count: 1 } }
        ]);

        res.status(200).json(pieChartData);
    } catch (error) {
        res.status(500).send('Error fetching pie chart data');
    }
});

app.get('/api/combined-data', async (req, res) => {
    const { month } = req.query;

    try {
        const transactionsResponse = await axios.get(`http://localhost:${PORT}/api/transactions`, { params: { month } });
        const statisticsResponse = await axios.get(`http://localhost:${PORT}/api/statistics`, { params: { month } });
        const barChartResponse = await axios.get(`http://localhost:${PORT}/api/bar-chart`, { params: { month } });
        const pieChartResponse = await axios.get(`http://localhost:${PORT}/api/pie-chart`, { params: { month } });

        res.status(200).json({
            transactions: transactionsResponse.data,
            statistics: statisticsResponse.data,
            barChart: barChartResponse.data,
            pieChart: pieChartResponse.data
        });
    } catch (error) {
        res.status(500).send('Error fetching combined data');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
