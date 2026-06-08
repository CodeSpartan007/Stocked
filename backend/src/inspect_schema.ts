import { sequelize } from './models/index';

async function run() {
  try {
    if (sequelize.getDialect() === 'sqlite') {
      const [results] = await sequelize.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='Stocks';");
      console.log(results);
      const [indexes] = await sequelize.query("SELECT * FROM sqlite_master WHERE type='index' AND tbl_name='Stocks';");
      console.log(indexes);
    } else {
      console.log('Skipping sqlite_master schema checks on non-SQLite database dialect.');
    }
  } catch (error) {
    console.error(error);
  } finally {
    await sequelize.close();
  }
}

run();
