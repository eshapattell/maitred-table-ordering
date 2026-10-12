// tableService.js: API client functions for table management
import api from './api.js';

export const fetchTables = async () => {
  const res = await api.get('/tables');
  const list = Array.isArray(res.data?.tables) ? res.data.tables : [];
  return list.map((table) => ({ id: table.id, number: table.number }));
};

export const createTable = async (number) => {
  const res = await api.post('/tables', { number });
  const table = res.data?.table;
  return { id: table.id, number: table.number };
};

export const fetchTableQR = async (tableId) => {
  const res = await api.get(`/tables/${encodeURIComponent(tableId)}/qr`);
  return res.data;
};

export const rotateTableToken = async (tableId) => {
  const res = await api.post(`/tables/${encodeURIComponent(tableId)}/rotate-token`);
  const table = res.data?.table;
  return { id: table.id, number: table.number };
};

export const deleteTable = async (tableId) => {
  const res = await api.delete(`/tables/${encodeURIComponent(tableId)}`);
  return res.data;
};
