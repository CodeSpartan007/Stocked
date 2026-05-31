import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { User } from './User';

export class ExportLogs extends Model {
  declare id: string;
  declare userId: string;
  declare reportType: string;
  declare exportType: string;
  declare status: string;
  declare generatedAt: Date;
  declare filename: string;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

ExportLogs.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    reportType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    exportType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'pending',
    },
    generatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    filename: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'ExportLogs',
    tableName: 'ExportLogs',
  }
);
