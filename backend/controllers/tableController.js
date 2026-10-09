// tableController.js: Table management and QR generation controller for maitred
import crypto from 'crypto';
import mongoose from 'mongoose';
import Table from '../models/Table.js';
import TableSession from '../models/TableSession.js';
import { buildTableUrl, generateQR } from '../utils/generateQR.js';

/**
 * Returns a list of all tables belonging to the authenticated owner's restaurant,
 * sorted by table number ascending.
 */
export const getTables = async (req, res, next) => {
  try {
    const tables = await Table.find({ restaurantId: req.user.restaurantId })
      .sort({ number: 1 })
      .lean();

    res.status(200).json({
      tables: tables.map((t) => ({
        id: String(t._id),
        number: t.number,
        qrToken: t.qrToken,
      })),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Provisions a new dining table with an integer number and unique QR token.
 * Strictly scoped to the authenticated owner's restaurant.
 */
export const createTable = async (req, res, next) => {
  try {
    const { number } = req.body || {};

    // Validate table number: must be an integer between 1 and 500
    if (
      typeof number !== 'number' ||
      !Number.isInteger(number) ||
      number < 1 ||
      number > 500
    ) {
      return res.status(400).json({ message: 'Invalid table number' });
    }

    // Check for duplicate table number within the same restaurant
    const existing = await Table.findOne({
      restaurantId: req.user.restaurantId,
      number,
    });
    if (existing) {
      return res.status(409).json({ message: 'Table number already exists' });
    }

    const qrToken = crypto.randomBytes(16).toString('hex');

    const created = await Table.create({
      restaurantId: req.user.restaurantId,
      number,
      qrToken,
    });

    res.status(201).json({
      table: {
        id: String(created._id),
        number: created.number,
        qrToken: created.qrToken,
      },
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'Table number already exists' });
    }
    next(err);
  }
};

/**
 * Generates and returns the QR code data URL and table join URL for a specific table.
 */
export const getTableQR = async (req, res, next) => {
  try {
    const { tableId } = req.params;

    if (!mongoose.isObjectIdOrHexString(tableId)) {
      return res.status(404).json({ message: 'Not found' });
    }

    const table = await Table.findOne({
      _id: tableId,
      restaurantId: req.user.restaurantId,
    }).lean();

    if (!table) {
      return res.status(404).json({ message: 'Not found' });
    }

    const clientUrl = process.env.CLIENT_URL;
    const url = buildTableUrl({
      clientUrl,
      restaurantId: table.restaurantId,
      tableNumber: table.number,
      qrToken: table.qrToken,
    });

    const qrDataUrl = await generateQR(url);

    res.status(200).json({
      table: {
        id: String(table._id),
        number: table.number,
      },
      url,
      qrDataUrl,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Deletes a table if it does not have any currently open table sessions.
 */
export const deleteTable = async (req, res, next) => {
  try {
    const { tableId } = req.params;

    if (!mongoose.isObjectIdOrHexString(tableId)) {
      return res.status(404).json({ message: 'Not found' });
    }

    const table = await Table.findOne({
      _id: tableId,
      restaurantId: req.user.restaurantId,
    });

    if (!table) {
      return res.status(404).json({ message: 'Not found' });
    }

    // Prohibit deletion if active diners have an open session at this table
    const hasOpenSession = await TableSession.exists({
      tableId: table._id,
      status: 'open',
    });

    if (hasOpenSession) {
      return res.status(409).json({ message: 'Table has an open session' });
    }

    await Table.findByIdAndDelete(table._id);

    res.status(200).json({ message: 'Table deleted' });
  } catch (err) {
    next(err);
  }
};
