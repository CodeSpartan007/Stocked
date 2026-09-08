"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.down = exports.up = void 0;
const nseScraperService_1 = require("../services/nseScraperService");
const up = async ({ context: queryInterface }) => {
    const sequelize = queryInterface.sequelize;
    const isSqlite = sequelize.getDialect() === 'sqlite';
    const quote = isSqlite ? '`' : '"';
    // Find all stocks that are NSE symbols (except TRFC) and ensure their currency is 'KES'
    try {
        const [stocks] = (await sequelize.query(`SELECT ${quote}id${quote}, ${quote}symbol${quote}, ${quote}currency${quote} FROM ${quote}Stocks${quote}`));
        for (const stock of stocks) {
            const sym = (stock.symbol || '').trim().toUpperCase();
            const cleanSym = sym.replace(/\.(NR|NSE|XNA|NA)$/i, '').replace(/^(NSE|NSEKE):/i, '').replace(/:NSE$/i, '');
            const isNse = nseScraperService_1.NSE_SYMBOLS_SET.has(cleanSym) ||
                sym.endsWith('.NR') ||
                sym.endsWith('.NSE') ||
                sym.startsWith('NSE:') ||
                sym.startsWith('NSEKE:');
            if (isNse && cleanSym !== 'TRFC') {
                await sequelize.query(`UPDATE ${quote}Stocks${quote} SET ${quote}currency${quote} = 'KES' WHERE ${quote}id${quote} = :id`, { replacements: { id: stock.id } });
            }
        }
    }
    catch (err) {
        console.warn('[Migration 0006] Warning during Stocks currency fix:', err);
    }
};
exports.up = up;
const down = async ({ context: _queryInterface }) => {
    // Bidirectional migration requirement: KES is the authentic currency for NSE stocks
};
exports.down = down;
