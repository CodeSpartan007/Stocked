"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const index_1 = require("./models/index");
async function run() {
    try {
        const [prices] = await index_1.sequelize.query("SELECT * FROM \"DailyPrices\" WHERE \"userId\" = 'e57a4a7b-765c-4718-8086-b6388d7d02ad' ORDER BY \"date\" ASC;");
        console.log(prices);
    }
    catch (error) {
        console.error(error);
    }
    finally {
        await index_1.sequelize.close();
    }
}
run();
