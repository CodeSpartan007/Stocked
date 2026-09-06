import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { User } from './User';
import { encrypt, decrypt } from '../utils/crypto';

export class UserSetting extends Model {
  declare userId: string;
  declare provider: 'alphavantage' | 'polygon' | 'manual';
  declare apiKey: string | null;
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
        return rawValue ? decrypt(rawValue, userId) : null;
      },
      set(value: string | null) {
        if (value) {
          const userId = this.getDataValue('userId') || this.userId;
          this.setDataValue('apiKey', encrypt(value, userId));
        } else {
          this.setDataValue('apiKey', null);
        }
      },
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
      attributes: { exclude: ['apiKey'] },
    },
    scopes: {
      withApiKey: {
        attributes: { include: ['apiKey'] },
      },
    },
  }
);
