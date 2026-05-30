import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { User } from './User';

export class UserSetting extends Model {
  declare userId: string;
  declare provider: 'alphavantage' | 'polygon' | 'manual';
  declare apiKey: string | null;
  declare refreshInterval: number;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

UserSetting.init(
  {
    userId: {
      type: DataTypes.STRING,
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
      type: DataTypes.STRING,
      allowNull: true,
    },
    refreshInterval: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 60,
    },
  },
  {
    sequelize,
    modelName: 'UserSetting',
    tableName: 'UserSettings',
  }
);
