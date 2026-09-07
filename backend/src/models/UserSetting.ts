import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { User } from './User';
import { encrypt, decrypt } from '../utils/crypto';

export class UserSetting extends Model {
  declare userId: string;
  declare provider: 'alphavantage' | 'polygon' | 'manual';
  declare apiKey: string | null;
  declare alphaVantageApiKey: string | null;
  declare polygonApiKey: string | null;
  declare autoSwitchOnRateLimit: boolean;
  declare refreshInterval: number;
  declare costBasisMethod: 'average' | 'fifo';

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

UserSetting.init(
  {
    userId: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    provider: {
      type: DataTypes.ENUM('alphavantage', 'polygon', 'manual'),
      allowNull: false,
      defaultValue: 'manual',
    },
    apiKey: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const rawValue = this.getDataValue('apiKey');
        const userId = this.getDataValue('userId') || this.userId;
        if (rawValue) {
          return decrypt(rawValue, userId);
        }
        const provider = this.getDataValue('provider');
        if (provider === 'alphavantage') {
          return this.alphaVantageApiKey;
        } else if (provider === 'polygon') {
          return this.polygonApiKey;
        }
        return null;
      },
      set(value: string | null) {
        const userId = this.getDataValue('userId') || this.userId;
        if (value) {
          this.setDataValue('apiKey', encrypt(value, userId));
        } else {
          this.setDataValue('apiKey', null);
        }
      },
    },
    alphaVantageApiKey: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const rawValue = this.getDataValue('alphaVantageApiKey');
        const userId = this.getDataValue('userId') || this.userId;
        if (rawValue) {
          return decrypt(rawValue, userId);
        }
        const provider = this.getDataValue('provider');
        if (provider === 'alphavantage') {
          const rawLegacy = this.getDataValue('apiKey');
          return rawLegacy ? decrypt(rawLegacy, userId) : null;
        }
        return null;
      },
      set(value: string | null) {
        const userId = this.getDataValue('userId') || this.userId;
        if (value) {
          this.setDataValue('alphaVantageApiKey', encrypt(value, userId));
        } else {
          this.setDataValue('alphaVantageApiKey', null);
        }
      },
    },
    polygonApiKey: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const rawValue = this.getDataValue('polygonApiKey');
        const userId = this.getDataValue('userId') || this.userId;
        if (rawValue) {
          return decrypt(rawValue, userId);
        }
        const provider = this.getDataValue('provider');
        if (provider === 'polygon') {
          const rawLegacy = this.getDataValue('apiKey');
          return rawLegacy ? decrypt(rawLegacy, userId) : null;
        }
        return null;
      },
      set(value: string | null) {
        const userId = this.getDataValue('userId') || this.userId;
        if (value) {
          this.setDataValue('polygonApiKey', encrypt(value, userId));
        } else {
          this.setDataValue('polygonApiKey', null);
        }
      },
    },
    autoSwitchOnRateLimit: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    refreshInterval: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 60,
    },
    costBasisMethod: {
      type: DataTypes.ENUM('average', 'fifo'),
      allowNull: false,
      defaultValue: 'average',
    },
  },
  {
    sequelize,
    modelName: 'UserSetting',
    tableName: 'UserSettings',
    defaultScope: {
      attributes: { exclude: ['apiKey', 'alphaVantageApiKey', 'polygonApiKey'] },
    },
    scopes: {
      withApiKey: {
        attributes: { include: ['apiKey', 'alphaVantageApiKey', 'polygonApiKey'] },
      },
    },
  }
);

UserSetting.beforeSave((instance) => {
  const userId = instance.getDataValue('userId') || instance.userId;
  if (!userId) return;

  // Synchronize legacy apiKey column with active provider credentials
  if (instance.provider === 'alphavantage') {
    const avRaw = instance.getDataValue('alphaVantageApiKey');
    if (avRaw) {
      instance.setDataValue('apiKey', avRaw);
    } else if (instance.getDataValue('apiKey')) {
      instance.setDataValue('alphaVantageApiKey', instance.getDataValue('apiKey'));
    }
  } else if (instance.provider === 'polygon') {
    const polyRaw = instance.getDataValue('polygonApiKey');
    if (polyRaw) {
      instance.setDataValue('apiKey', polyRaw);
    } else if (instance.getDataValue('apiKey')) {
      instance.setDataValue('polygonApiKey', instance.getDataValue('apiKey'));
    }
  }
});
