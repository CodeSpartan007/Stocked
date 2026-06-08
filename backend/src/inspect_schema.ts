import { sequelize } from './models/index';

async function run() {
  try {
    const [results] = await sequelize.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='Stocks';");
    console.log(results);
    const [indexes] = await sequelize.query("SELECT * FROM sqlite_master WHERE type='index' AND tbl_name='Stocks';");
    console.log(indexes);
  } catch (error) {
    console.error(error);
  } finally {
    await sequelize.close();
  }
}

run();
