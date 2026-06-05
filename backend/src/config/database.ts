import { Sequelize } from 'sequelize';
import path from 'path';

const isProduction = process.env.NODE_ENV === 'production';

// In development: use local SQLite file.
// In production: use Neon Postgres via DATABASE_URL env var.
export const sequelize = isProduction
  ? new Sequelize(process.env.DATABASE_URL!, {
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
    })
  : new Sequelize({
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
