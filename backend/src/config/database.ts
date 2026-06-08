import { Sequelize } from 'sequelize';
import path from 'path';

const isProduction = process.env.NODE_ENV === 'production';

// In development: use local SQLite file.
// In production: use Neon Postgres via DATABASE_URL env var.
function createSequelize(): Sequelize {
  const dbUrl = process.env.DATABASE_URL;

  if (isProduction && !dbUrl) {
    console.error(
      '[FATAL] DATABASE_URL is not set. In production, a Postgres connection string is required.\n' +
      'Set DATABASE_URL in your Railway environment variables and redeploy.'
    );
    process.exit(1);
  }

  // If DATABASE_URL is provided (either in production or locally), use Postgres
  if (dbUrl) {
    console.log('[Database] Connecting to Postgres database...');
    // Replace sslmode=require with sslmode=verify-full to satisfy the pg driver deprecation warning
    const cleanDbUrl = dbUrl.replace('sslmode=require', 'sslmode=verify-full');
    return new Sequelize(cleanDbUrl, {
      dialect: 'postgres',
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false, // Required for Neon's managed SSL
        },
      },
      logging: false,
      define: {
        timestamps: true,
      },
    });
  }

  console.log('[Database] DATABASE_URL not set. Connecting to local SQLite...');
  return new Sequelize({
    dialect: 'sqlite',
    storage: path.resolve(__dirname, '../../database.sqlite'),
    logging: false,
    define: {
      timestamps: true,
    },
    hooks: {
      afterConnect: (connection: any, callback: any) => {
        connection.run('PRAGMA foreign_keys = ON;', callback);
      },
    },
  });
}

export const sequelize = createSequelize();
