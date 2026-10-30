// @ts-check
import { AttendanceEngine } from './AttendanceEngine.mjs';

/**
 * Siembra datos iniciales solo si no existe flag de purga ni registros reales (Directiva 14)
 */
export function seedDemoDataIfEmpty(storageObj = null) {
  if (storageObj && typeof storageObj.getItem === 'function') {
    if (storageObj.getItem('mipcontrol_demo_purged') === 'true') {
      return;
    }
  }
  const existingEmps = AttendanceEngine.getEmployees();
  const existingLogs = AttendanceEngine.getRawLogs();
  if (existingEmps.length > 0 || existingLogs.length > 0) {
    return;
  }
}
