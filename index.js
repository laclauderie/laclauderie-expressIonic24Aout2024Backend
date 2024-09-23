const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const { connectToDatabase, closeDatabaseConnection } = require('./src/config/db');
const userRoute = require('./src/routes/userRoute');
const businessOwnerRoute = require('./src/routes/businessOwnerRoute');
const paymentRoute = require('./src/routes/paymentRoute');
const commerceRoute = require('./src/routes/commerceRoute');
const categoryRoute = require('./src/routes/categoryRoute');
const productRoutes = require('./src/routes/productsRoute');
const detailsRoute = require('./src/routes/detailsRoute');
const villesRoute = require('./src/routes/villesRoute');
const expirePaymentsJob = require('./src/jobs/expirePaymentsJob');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.APP_URL || !process.env.NODE_ENV || !process.env.PORT) {
  console.error('Missing required environment variables. Check your .env file.');
  process.exit(1); 
}

app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [process.env.APP_URL, 'http://localhost:8100'];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed from this origin.'));
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  allowedHeaders: 'Content-Type,Authorization'
}));

app.use('/uploads', (req, res, next) => {
  console.log(`Serving static file request: ${req.originalUrl}`);
  next();
}, express.static(path.join(__dirname, 'uploads')));

const routes = [
  { path: '/api/users', handler: userRoute },
  { path: '/api/business-owners', handler: businessOwnerRoute },
  { path: '/api/payments', handler: paymentRoute },
  { path: '/api/my-commerces', handler: commerceRoute },
  { path: '/api/categories', handler: categoryRoute },
  { path: '/api/products', handler: productRoutes },
  { path: '/api/details', handler: detailsRoute },
  { path: '/api/villes', handler: villesRoute }
];

routes.forEach(route => {
  try {
    app.use(route.path, route.handler);
  } catch (error) {
    console.error(`Error setting up route: ${route.path}`, error);
  }
});

const runExpirePaymentsJobOnStart = async () => {
  try {
    await expirePaymentsJob();
    console.log('Expire Payments Job executed successfully on startup.');
  } catch (error) {
    console.error('Error executing expire payments job on startup:', error);
  }
};

runExpirePaymentsJobOnStart();

connectToDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
      if (process.env.NODE_ENV === 'production') {
        console.log(`App URL: ${process.env.APP_URL}`);
      }
    });
  })
  .catch(error => {
    console.error('Error starting server:', error);
    process.exit(1);
  });

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  try {
    await closeDatabaseConnection();
    console.log('Database connection closed gracefully');
    process.exit(0);
  } catch (error) {
    console.error('Error closing database connection:', error);
    process.exit(1);
  }
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason.message || reason);
  try {
    await closeDatabaseConnection();
    console.log('Database connection closed due to unhandled rejection');
    process.exit(1);
  } catch (error) {
    console.error('Error closing database connection after unhandled rejection:', error);
    process.exit(1);
  }
});
