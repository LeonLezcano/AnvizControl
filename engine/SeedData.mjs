// @ts-check
import { AttendanceEngine } from '../engine/AttendanceEngine.mjs';

/**
 * Siembra datos demo realistas si el archivo de logs está vacío
 */
export function seedDemoDataIfEmpty() {
  const existing = AttendanceEngine.getRawLogs();
  if (existing.length > 0) return;

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;

  // Ayer
  const yesterdayObj = new Date(now.getTime() - 24 * 3600 * 1000);
  const yStr = yesterdayObj.toISOString().slice(0, 10);

  const demoLogs = [
    // Ayer - Juan Pérez (Entró en Sucursal 1, Salió en Sucursal 2)
    {
      userCode: '1',
      branch: 'Sucursal 1 (Local)',
      timestamp: `${yStr}T07:58:12.000Z`,
      verifyDesc: 'Huella'
    },
    {
      userCode: '101',
      branch: 'Sucursal 2 (5 cuadras)',
      timestamp: `${yStr}T17:05:40.000Z`,
      verifyDesc: 'Huella'
    },

    // Ayer - María García (Turno cortado: mañana y tarde)
    {
      userCode: '2',
      branch: 'Sucursal 1 (Local)',
      timestamp: `${yStr}T08:02:10.000Z`,
      verifyDesc: 'Huella'
    },
    {
      userCode: '2',
      branch: 'Sucursal 1 (Local)',
      timestamp: `${yStr}T12:01:45.000Z`,
      verifyDesc: 'Huella'
    },
    {
      userCode: '102',
      branch: 'Sucursal 2 (5 cuadras)',
      timestamp: `${yStr}T16:00:22.000Z`,
      verifyDesc: 'Huella'
    },
    {
      userCode: '102',
      branch: 'Sucursal 2 (5 cuadras)',
      timestamp: `${yStr}T20:15:30.000Z`,
      verifyDesc: 'Huella'
    },

    // Ayer - Carlos Rodríguez (Fichada incompleta / olvidó salida)
    {
      userCode: '3',
      branch: 'Sucursal 1 (Local)',
      timestamp: `${yStr}T09:12:00.000Z`,
      verifyDesc: 'Tarjeta RFID'
    },

    // Hoy - Juan Pérez (Presente, entró 08:02 en Sucursal 1)
    {
      userCode: '1',
      branch: 'Sucursal 1 (Local)',
      timestamp: `${todayStr}T08:02:30.000Z`,
      verifyDesc: 'Huella'
    },
    // Hoy - María García (Presente, entró 07:59 en Sucursal 2)
    {
      userCode: '102',
      branch: 'Sucursal 2 (5 cuadras)',
      timestamp: `${todayStr}T07:59:15.000Z`,
      verifyDesc: 'Huella'
    }
  ];

  AttendanceEngine.appendLogs(demoLogs);
  console.log('[Seed] Datos de demostración inicializados con éxito.');
}
