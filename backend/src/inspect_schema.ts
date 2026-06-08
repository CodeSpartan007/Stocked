import 'dotenv/config';
import { sequelize, initDb } from './models/index';

async function run() {
  try {
    const [prices] = await sequelize.query("SELECT * FROM \"DailyPrices\" WHERE \"userId\" = 'e57a4a7b-765c-4718-8086-b6388d7d02ad' ORDER BY \"date\" ASC;");
    console.log(prices);
  } catch (error) {
    console.error(error);
  } finally {
    await sequelize.close();
  }
}

run();
