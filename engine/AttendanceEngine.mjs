// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const EMPLOYEES_FILE = path.join(DATA_DIR, 'employees.json');
const LOGS_FILE = path.join(DATA_DIR, 'attendance_logs.json');
const INCIDENTS_FILE = path.join(DATA_DIR, 'incidents.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

/**
 * Helper de lectura y escritura JSON sincrónico y seguro
 */
function readJson(file, defaultVal) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(defaultVal, null, 2), 'utf8');
      return defaultVal;
    }
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return defaultVal;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

export class AttendanceEngine {
  /**
   * Obtiene todos los empleados
   */
  static getEmployees() {
    return readJson(EMPLOYEES_FILE, [
      {
        id: 'EMP-001',
        name: 'Juan Pérez',
        dni: '34567890',
        clockIdBranch1: '1',
        clockIdBranch2: '101',
        scheduleType: 'CORRIDO', // 'CORRIDO' o 'CORTADO'
        shiftStart1: '08:00',
        shiftEnd1: '17:00',
        shiftStart2: null,
        shiftEnd2: null,
        workDays: [1, 2, 3, 4, 5], // Lunes a Viernes
        status: 'ACTIVE',
        hourlyRate: 3500
      },
      {
        id: 'EMP-002',
        name: 'María García',
        dni: '38901234',
        clockIdBranch1: '2',
        clockIdBranch2: '102',
        scheduleType: 'CORTADO',
        shiftStart1: '08:00',
        shiftEnd1: '12:00',
        shiftStart2: '16:00',
        shiftEnd2: '20:00',
        workDays: [1, 2, 3, 4, 5, 6],
        status: 'ACTIVE',
        hourlyRate: 3800
      },
      {
        id: 'EMP-003',
        name: 'Carlos Rodríguez',
        dni: '41234567',
        clockIdBranch1: '3',
        clockIdBranch2: '3',
        scheduleType: 'CORRIDO',
        shiftStart1: '09:00',
        shiftEnd1: '18:00',
        shiftStart2: null,
        shiftEnd2: null,
        workDays: [1, 2, 3, 4, 5],
        status: 'ACTIVE',
        hourlyRate: 3400
      }
    ]);
  }

  /**
   * Guarda o actualiza un empleado
   */
  static saveEmployee(empData) {
    const employees = this.getEmployees();
    const cleanId = String(empData.id || '').trim();
    const index = employees.findIndex((e) => e.id === cleanId);

    const record = {
      id: cleanId || `EMP-${Date.now().toString().slice(-4)}`,
      name: String(empData.name || '').trim(),
      dni: String(empData.dni || '').trim(),
      clockIdBranch1: String(empData.clockIdBranch1 || '').trim(),
      clockIdBranch2: String(empData.clockIdBranch2 || '').trim(),
      scheduleType: empData.scheduleType === 'CORTADO' ? 'CORTADO' : 'CORRIDO',
      shiftStart1: empData.shiftStart1 || '08:00',
      shiftEnd1: empData.shiftEnd1 || '17:00',
      shiftStart2: empData.shiftStart2 || null,
      shiftEnd2: empData.shiftEnd2 || null,
      workDays: Array.isArray(empData.workDays) ? empData.workDays : [1, 2, 3, 4, 5],
      status: empData.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      hourlyRate: Number(empData.hourlyRate) || 0,
      updatedAt: new Date().toISOString()
    };

    if (index >= 0) {
      employees[index] = { ...employees[index], ...record };
    } else {
      employees.push(record);
    }

    writeJson(EMPLOYEES_FILE, employees);
    return record;
  }

  /**
   * Elimina un empleado por ID
   */
  static deleteEmployee(id) {
    let employees = this.getEmployees();
    employees = employees.filter((e) => e.id !== id);
    writeJson(EMPLOYEES_FILE, employees);
    return true;
  }

  /**
   * Obtiene todos los logs brutos de fichadas
   */
  static getRawLogs() {
    return readJson(LOGS_FILE, []);
  }

  /**
   * Agrega o sincroniza fichadas (con deduplicación por empleado+timestamp)
   * @param {Array<{ id?: string, userCode: string, timestamp: string, branch: string, verifyDesc?: string, manual?: boolean, note?: string }>} newLogs
   */
  static appendLogs(newLogs) {
    const existing = this.getRawLogs();
    const map = new Map();

    for (const log of existing) {
      const key = `${log.userCode}_${log.timestamp}_${log.branch}`;
      map.set(key, log);
    }

    let addedCount = 0;
    for (const log of newLogs) {
      const key = `${log.userCode}_${log.timestamp}_${log.branch}`;
      if (!map.has(key)) {
        map.set(key, {
          id: log.id || `LOG-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          userCode: String(log.userCode),
          timestamp: log.timestamp,
          branch: log.branch || 'Sucursal 1',
          verifyDesc: log.verifyDesc || 'Huella',
          manual: Boolean(log.manual),
          note: log.note || ''
        });
        addedCount++;
      }
    }

    const updatedList = Array.from(map.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    writeJson(LOGS_FILE, updatedList);
    return { total: updatedList.length, added: addedCount };
  }

  /**
   * Modifica o rectifica una fichada específica
   */
  static updateLog(logId, updates) {
    const logs = this.getRawLogs();
    const idx = logs.findIndex((l) => l.id === logId);
    if (idx === -1) return null;

    logs[idx] = {
      ...logs[idx],
      ...updates,
      manual: true,
      rectifiedAt: new Date().toISOString()
    };

    writeJson(LOGS_FILE, logs);
    return logs[idx];
  }

  /**
   * Elimina una fichada errónea por ID
   */
  static deleteLog(logId) {
    let logs = this.getRawLogs();
    logs = logs.filter((l) => l.id !== logId);
    writeJson(LOGS_FILE, logs);
    return true;
  }

  /**
   * Resuelve a qué empleado corresponde una fichada según su ID de reloj y sucursal
   * @param {string} userCode
   * @param {string} branch
   * @param {Array<any>} employees
   */
  static resolveEmployee(userCode, branch, employees) {
    const code = String(userCode).trim();
    return employees.find((emp) => {
      if (branch.includes('2') || branch.toLowerCase().includes('sucursal 2')) {
        return String(emp.clockIdBranch2).trim() === code;
      }
      return String(emp.clockIdBranch1).trim() === code;
    }) || null;
  }

  /**
   * Filtra rebotes en menos de 3 minutos (apoyó 2 veces seguidas el dedo por error)
   * y agrupa fichadas ordenadas cronológicamente
   */
  static filterBounces(logs, windowMinutes = 3) {
    if (!logs || logs.length === 0) return [];
    const sorted = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const filtered = [];

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      if (filtered.length === 0) {
        filtered.push(current);
        continue;
      }

      const prev = filtered[filtered.length - 1];
      const diffMinutes = (new Date(current.timestamp).getTime() - new Date(prev.timestamp).getTime()) / (1000 * 60);

      // Si fue a menos de 3 minutos en el mismo dispositivo o sucursal, es un rebote accidental
      if (diffMinutes < windowMinutes) {
        continue;
      }
      filtered.push(current);
    }

    return filtered;
  }

  /**
   * Procesa las jornadas diarias de un empleado unificando fichadas de ambas sucursales
   * @param {string} employeeId
   * @param {string} startDateStr - YYYY-MM-DD
   * @param {string} endDateStr - YYYY-MM-DD
   */
  static calculateAttendance(employeeId, startDateStr, endDateStr) {
    const employees = this.getEmployees();
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return null;

    const allLogs = this.getRawLogs();

    // Extraer todas las fichadas que correspondan a este empleado (reloj 1 o reloj 2)
    const empLogs = allLogs.filter((log) => {
      const matched = this.resolveEmployee(log.userCode, log.branch, employees);
      return matched && matched.id === emp.id;
    });

    // Agrupar por fecha local (YYYY-MM-DD)
    const byDate = new Map();
    for (const log of empLogs) {
      const dStr = log.timestamp.slice(0, 10);
      if (!byDate.has(dStr)) byDate.set(dStr, []);
      byDate.get(dStr).push(log);
    }

    // Generar rango de días
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const daysReport = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const curDateStr = d.toISOString().slice(0, 10);
      const dayOfWeek = d.getUTCDay(); // 0 Dom, 1 Lun...
      const isWorkDay = emp.workDays.includes(dayOfWeek);

      const rawPunches = byDate.get(curDateStr) || [];
      const cleanPunches = this.filterBounces(rawPunches);

      // Deducción de pares Entrada/Salida
      const pairs = [];
      for (let i = 0; i < cleanPunches.length; i += 2) {
        const inPunch = cleanPunches[i];
        const outPunch = cleanPunches[i + 1] || null;
        pairs.push({ in: inPunch, out: outPunch });
      }

      // Cálculo de minutos trabajados
      let totalMinutesWorked = 0;
      let hasOddPunch = cleanPunches.length % 2 !== 0;

      for (const pair of pairs) {
        if (pair.in && pair.out) {
          const diffMs = new Date(pair.out.timestamp).getTime() - new Date(pair.in.timestamp).getTime();
          if (diffMs > 0) {
            totalMinutesWorked += Math.floor(diffMs / (1000 * 60));
          }
        }
      }

      // Estado del día
      let status = 'NORMAL';
      let lateMinutes = 0;
      let earlyLeaveMinutes = 0;

      if (cleanPunches.length === 0) {
        status = isWorkDay ? 'AUSENTE' : 'FRANCO';
      } else if (hasOddPunch) {
        status = 'FICHADA_INCOMPLETA'; // Olvidó fichar salida o entrada
      } else {
        // Evaluar llegada tarde sobre la primera fichada
        const firstTime = cleanPunches[0].timestamp.slice(11, 16);
        if (emp.shiftStart1 && firstTime > emp.shiftStart1) {
          const [sh, sm] = emp.shiftStart1.split(':').map(Number);
          const [ph, pm] = firstTime.split(':').map(Number);
          lateMinutes = (ph * 60 + pm) - (sh * 60 + sm);
          if (lateMinutes > 10) {
            status = 'LLEGADA_TARDE';
          }
        }
      }

      const hoursWorked = +(totalMinutesWorked / 60).toFixed(2);
      // Suponemos 8h estándar para cálculo de horas extras
      const normalHours = Math.min(hoursWorked, 8);
      const overtimeHours = Math.max(0, +(hoursWorked - 8).toFixed(2));

      daysReport.push({
        date: curDateStr,
        dayOfWeek,
        isWorkDay,
        status,
        punches: cleanPunches,
        pairs,
        hasOddPunch,
        lateMinutes,
        earlyLeaveMinutes,
        totalMinutesWorked,
        hoursWorked,
        normalHours,
        overtimeHours,
        branchesVisited: Array.from(new Set(cleanPunches.map((p) => p.branch)))
      });
    }

    return {
      employee: emp,
      range: { startDate: startDateStr, endDate: endDateStr },
      days: daysReport,
      summary: {
        totalDays: daysReport.length,
        daysWorked: daysReport.filter((d) => d.punches.length > 0).length,
        absentDays: daysReport.filter((d) => d.status === 'AUSENTE').length,
        oddPunchDays: daysReport.filter((d) => d.hasOddPunch).length,
        lateDays: daysReport.filter((d) => d.lateMinutes > 10).length,
        totalHours: +(daysReport.reduce((acc, d) => acc + d.hoursWorked, 0)).toFixed(2),
        totalNormalHours: +(daysReport.reduce((acc, d) => acc + d.normalHours, 0)).toFixed(2),
        totalOvertimeHours: +(daysReport.reduce((acc, d) => acc + d.overtimeHours, 0)).toFixed(2)
      }
    };
  }

  /**
   * Monitor en vivo: quién está trabajando ahora y en qué sucursal
   */
  static getLiveStatus() {
    const employees = this.getEmployees();
    const todayStr = new Date().toISOString().slice(0, 10);
    const allLogs = this.getRawLogs();

    const result = employees.map((emp) => {
      const todayLogs = allLogs.filter((log) => {
        const matches = this.resolveEmployee(log.userCode, log.branch, employees);
        return matches && matches.id === emp.id && log.timestamp.slice(0, 10) === todayStr;
      });

      const clean = this.filterBounces(todayLogs);
      const lastPunch = clean.length > 0 ? clean[clean.length - 1] : null;

      // Si la cantidad de fichadas es impar, la persona está adentro (trabajando)
      const isInside = clean.length % 2 === 1;

      return {
        id: emp.id,
        name: emp.name,
        dni: emp.dni,
        isInside,
        status: !lastPunch ? 'SIN_FICHAR' : isInside ? 'PRESENTE' : 'RETIRADO',
        lastBranch: lastPunch ? lastPunch.branch : null,
        lastPunchTime: lastPunch ? lastPunch.timestamp.slice(11, 19) : null,
        todayPunchesCount: clean.length
      };
    });

    return result;
  }
}
