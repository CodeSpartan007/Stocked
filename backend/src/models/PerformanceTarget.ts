import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { User } from './User';

export class PerformanceTarget extends Model {
  declare id: string;
  declare userId: string;
  declare targetName: string;
  declare targetType: 'portfolio_value' | 'total_return' | 'annualized_return';
  declare targetValue: number;
  declare targetDate: string; // YYYY-MM-DD format
  declare isAchieved: boolean;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

PerformanceTarget.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    targetName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    targetType: {
      type: DataTypes.ENUM('portfolio_value', 'total_return', 'annualized_return'),
      allowNull: false,
      validate: {
        isIn: [['portfolio_value', 'total_return', 'annualized_return']],
      },
    },
    targetValue: {
      type: DataTypes.DECIMAL(12, 4),
      allowNull: false,
      validate: {
        gtZero(value: any) {
          if (Number(value) <= 0) {
            throw new Error('Target value must be greater than 0.');
          }
        }
      },
    },
    targetDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    isAchieved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'PerformanceTarget',
    tableName: 'PerformanceTargets',
  }
);
