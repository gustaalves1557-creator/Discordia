require('dotenv').config();
// Client gerado em ../prisma-client (output customizado, sem pasta oculta p/ empacotar)
const { PrismaClient } = require('../prisma-client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

module.exports = { prisma };
