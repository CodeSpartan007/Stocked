import { Sequelize } from 'sequelize';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../database.sqlite');

export const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath,
  logging: false, // Set to console.log to see SQL queries in development
  define: {
    timestamps: true,
  },
  hooks: {
    afterConnect: (connection: any, callback: any) => {
      connection.run('PRAGMA foreign_keys = ON;', callback);
    },
  },
});
