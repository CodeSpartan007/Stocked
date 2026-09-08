import { QueryInterface } from 'sequelize';
import { NSE_SYMBOLS_SET } from '../services/nseScraperService';

export const up = async ({ context: queryInterface }: { context: QueryInterface }): Promise<void> => {
  const sequelize = queryInterface.sequelize;
  const isSqlite = sequelize.getDialect() === 'sqlite';
  const quote = isSqlite ? '`' : '"';

  // Find all stocks that are NSE symbols (except TRFC) and ensure their currency is 'KES'
  try {
    const [stocks] = (await sequelize.query(
      `SELECT ${quote}id${quote}, ${quote}symbol${quote}, ${quote}currency${quote} FROM ${quote}Stocks${quote}`
    )) as [Array<{ id: string; symbol: string; currency: string }>, unknown];

    for (const stock of stocks) {
      const sym = (stock.symbol || '').trim().toUpperCase();
      const cleanSym = sym.replace(/\.(NR|NSE|XNA|NA)$/i, '').replace(/^(NSE|NSEKE):/i, '').replace(/:NSE$/i, '');
      const isNse =
        NSE_SYMBOLS_SET.has(cleanSym) ||
        sym.endsWith('.NR') ||
        sym.endsWith('.NSE') ||
        sym.startsWith('NSE:') ||
        sym.startsWith('NSEKE:');

      if (isNse && cleanSym !== 'TRFC') {
        await sequelize.query(
          `UPDATE ${quote}Stocks${quote} SET ${quote}currency${quote} = 'KES' WHERE ${quote}id${quote} = :id`,
          { replacements: { id: stock.id } }
        );
      }
    }
  } catch (err) {
    console.warn('[Migration 0006] Warning during Stocks currency fix:', err);
  }
};

export const down = async ({ context: _queryInterface }: { context: QueryInterface }): Promise<void> => {
  // Bidirectional migration requirement: KES is the authentic currency for NSE stocks
};
