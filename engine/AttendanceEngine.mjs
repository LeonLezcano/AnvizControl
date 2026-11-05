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
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const TOMBSTONES_FILE = path.join(DATA_DIR, 'tombstones.json');

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

/**
 * Convierte cualquier timestamp ISO (UTC o con offset) a fecha y hora local Argentina (UTC-3)
 * @param {string} isoStr
 * @returns {{ localDate: string, localTime: string, localDateTime: string, epochMs: number }}
 */
export function toArgentinaLocal(isoStr) {
  if (!isoStr) {
    return { localDate: '-', localTime: '-', localTimeFull: '-', localDateTime: '-', epochMs: 0 };
  }
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) {
    return { localDate: '-', localTime: '-', localTimeFull: '-', localDateTime: '-', epochMs: 0 };
  }
  // Restar 3 horas (UTC-3) al tiempo UTC para obtener componentes locales exactos de Argentina
  const arMs = d.getTime() - 3 * 3600 * 1000;
  const arDate = new Date(arMs);
  const yyyy = arDate.getUTCFullYear();
  const mm = String(arDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(arDate.getUTCDate()).padStart(2, '0');
  const hh = String(arDate.getUTCHours()).padStart(2, '0');
  const min = String(arDate.getUTCMinutes()).padStart(2, '0');
  const ss = String(arDate.getUTCSeconds()).padStart(2, '0');

  const localDate = `${yyyy}-${mm}-${dd}`;
  const localTime = `${hh}:${min}`;
  const localTimeFull = `${hh}:${min}:${ss}`;
  return {
    localDate,
    localTime,
    localTimeFull,
    localDateTime: `${localDate}T${localTimeFull}-03:00`,
    epochMs: d.getTime()
  };
}

export class AttendanceEngine {
  /**
   * Obtiene los dispositivos Anviz VF30 Pro registrados
   */
  static getDevices() {
    return readJson(DEVICES_FILE, [
      {
        id: '1930',
        cloudId: 15861,
        name: 'Neuquen 959',
        model: 'VF30PRO',
        serialNumber: '1630200022270042',
        ip: '192.168.0.218',
        port: 5010,
        department: 'Regondi srl',
        userCount: 24,
        fpCount: 33,
        pwdCount: 15,
        status: 'ONLINE',
        lastSync: '2026-10-30T13:36:00-03:00'
      },
      {
        id: '1931',
        cloudId: 15834,
        name: 'Ballarini 1111',
        model: 'VF30PRO',
        serialNumber: '1630200022240136',
        ip: 'Remoto (5 cuadras - Cloud Push)',
        port: 5010,
        department: 'Regondi srl',
        userCount: 24,
        fpCount: 33,
        pwdCount: 15,
        status: 'ONLINE',
        validity: '21/05/2025 - 22/05/2027',
        lastSync: '2026-10-30T13:38:00-03:00'
      }
    ]);
  }

  static saveDevices(devices) {
    writeJson(DEVICES_FILE, devices);
    return devices;
  }

  /**
   * Obtiene la lista de IDs eliminados (Tombstones - Directiva 6)
   */
  static getTombstones() {
    const list = readJson(TOMBSTONES_FILE, []);
    const set = new Set(list.map(String));
    // Array compatible con .includes(x) y con interfaz de Set (.has(x), .add(x))
    list.has = (id) => set.has(String(id));
    list.add = (id) => {
      if (!set.has(String(id))) {
        set.add(String(id));
        list.push(String(id));
      }
    };
    return list;
  }

  static addTombstone(id) {
    const list = this.getTombstones();
    list.add(String(id));
    writeJson(TOMBSTONES_FILE, Array.from(new Set(list)));
  }

  /**
   * Obtiene todos los empleados
   */
  static getEmployees() {
    return readJson(EMPLOYEES_FILE, []);
  }

  /**
   * Guarda o actualiza un empleado (CRUD)
   */
  static saveEmployee(empData) {
    if (!empData || typeof empData !== 'object') {
      throw new Error('Datos de empleado inválidos');
    }
    const employees = this.getEmployees();
    const workno = String(empData.workno || empData.clockIdBranch1 || empData.dni || '').trim();
    const cleanId = String(empData.id || (workno ? `EMP-${workno}` : `EMP-${Date.now().toString().slice(-4)}`)).trim();

    const index = employees.findIndex((e) => e.id === cleanId || (workno && String(e.workno) === workno));
    const existing = index >= 0 ? employees[index] : {};

    const record = {
      ...existing,
      id: existing.id || cleanId,
      cloudEmployeeId: empData.cloudEmployeeId ?? existing.cloudEmployeeId ?? null,
      name: String(empData.name || existing.name || '').trim(),
      dni: String(empData.dni || empData.workno || existing.dni || workno).trim(),
      workno: String(workno || existing.workno || empData.clockIdBranch1 || '').trim(),
      clockIdBranch1: String(empData.clockIdBranch1 || workno || existing.clockIdBranch1 || '').trim(),
      clockIdBranch2: String(empData.clockIdBranch2 || workno || existing.clockIdBranch2 || '').trim(),
      department: String(empData.department || existing.department || 'Regondi srl').trim(),
      position: String(empData.position ?? existing.position ?? '').trim(),
      tel: String(empData.tel ?? existing.tel ?? '').trim(),
      email: String(empData.email ?? existing.email ?? '').trim(),
      scheduleType: (empData.scheduleType || existing.scheduleType) === 'CORTADO' ? 'CORTADO' : 'CORRIDO',
      shiftStart1: empData.shiftStart1 || existing.shiftStart1 || '08:00',
      shiftEnd1: empData.shiftEnd1 || existing.shiftEnd1 || '17:00',
      shiftStart2: empData.shiftStart2 ?? existing.shiftStart2 ?? null,
      shiftEnd2: empData.shiftEnd2 ?? existing.shiftEnd2 ?? null,
      workDays: Array.isArray(empData.workDays) ? empData.workDays : (existing.workDays || [1, 2, 3, 4, 5]),
      hasFinger: Boolean(empData.hasFinger ?? existing.hasFinger ?? true),
      hasPassd: Boolean(empData.hasPassd ?? existing.hasPassd ?? false),
      hasCard: Boolean(empData.hasCard ?? existing.hasCard ?? false),
      status: empData.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      hourlyRate: Number(empData.hourlyRate ?? existing.hourlyRate) || 0,
      updatedAt: new Date().toISOString()
    };

    if (index >= 0) {
      employees[index] = record;
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
    const cleanId = String(id || '').trim();
    this.addTombstone(cleanId);
    let employees = this.getEmployees();
    employees = employees.filter((e) => e.id !== cleanId);
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
   * Agrega o sincroniza fichadas con deduplicación indexada por Map y respeto de Tombstones (Directiva 6)
   */
  static appendLogs(newLogs) {
    if (!Array.isArray(newLogs)) return { total: 0, added: 0 };
    const existing = this.getRawLogs();
    const tombstones = this.getTombstones();
    const mapById = new Map();
    const mapByComposite = new Map();

    for (const log of existing) {
      if (tombstones.has(String(log.id))) continue;
      mapById.set(log.id, log);
      const compKey = `${log.userCode}_${log.timestamp.slice(0, 19)}_${log.branch}`;
      mapByComposite.set(compKey, log);
    }

    let addedCount = 0;
    for (const log of newLogs) {
      if (!log || !log.userCode || !log.timestamp) continue;
      const logId = log.id || `LOG-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      if (tombstones.has(String(logId))) continue;

      const compKey = `${log.userCode}_${String(log.timestamp).slice(0, 19)}_${log.branch || 'Neuquen 959'}`;

      // No sobrescribir si ya fue rectificada manualmente
      const existingMatch = mapById.get(logId) || mapByComposite.get(compKey);
      if (existingMatch && existingMatch.manual) {
        continue;
      }

      if (!existingMatch) {
        const entry = {
          id: logId,
          userCode: String(log.userCode).trim(),
          employeeNameHint: log.employeeNameHint || '',
          departmentHint: log.departmentHint || '',
          timestamp: new Date(log.timestamp).toISOString(),
          branch: log.branch || 'Neuquen 959',
          verifyDesc: log.verifyDesc || 'Huella Dactilar',
          checktype: Number(log.checktype) || 128,
          manual: Boolean(log.manual),
          note: String(log.note || '')
        };
        mapById.set(entry.id, entry);
        mapByComposite.set(compKey, entry);
        addedCount++;
      }
    }

    const updatedList = Array.from(mapById.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    writeJson(LOGS_FILE, updatedList);
    return { total: updatedList.length, added: addedCount };
  }

  /**
   * Importa el lote completo desde CrossChex Cloud (Dispositivos, Empleados y Fichadas)
   */
  static importCrossChexCloudData({ devices = [], employees = [], records = [] }) {
    const tombstones = this.getTombstones();

    // 1. Dispositivos
    if (Array.isArray(devices) && devices.length > 0) {
      const mappedDevices = devices.map((d) => ({
        id: d.name?.includes('Neuquen') ? '1930' : d.name?.includes('Ballarini') ? '1931' : String(d.id),
        cloudId: d.id,
        name: d.name || 'VF30PRO',
        model: d.device_type || 'VF30PRO',
        serialNumber: d.serial_number || '',
        ip: d.name?.includes('Neuquen') ? '192.168.0.218' : 'Sucursal Remota (5 cuadras • Cloud Push)',
        port: 5010,
        department: d.department_name || 'Regondi srl',
        userCount: Number(d.user_total ?? 24),
        fpCount: Number(d.finger_total ?? 33),
        pwdCount: Number(d.passd_total ?? 15),
        status: 'ONLINE',
        lastSync: new Date().toISOString()
      }));
      this.saveDevices(mappedDevices);
    }

    // 2. Empleados
    let empAdded = 0;
    for (const cEmp of employees) {
      const workno = String(cEmp.workno || '').trim();
      const empId = `EMP-${workno}`;
      if (tombstones.has(empId)) continue;

      const fullName = [cEmp.first_name, cEmp.last_name]
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ');

      this.saveEmployee({
        id: empId,
        cloudEmployeeId: cEmp.id,
        name: fullName || `Empleado ${workno}`,
        dni: workno,
        workno,
        clockIdBranch1: workno,
        clockIdBranch2: workno,
        department: cEmp.department_name || 'Regondi srl',
        position: cEmp.position || '',
        tel: cEmp.tel || '',
        email: cEmp.email || '',
        hasFinger: Boolean(cEmp.has_finger),
        hasPassd: Boolean(cEmp.has_passd),
        hasCard: Boolean(cEmp.has_card),
        status: 'ACTIVE'
      });
      empAdded++;
    }

    // 3. Fichadas
    const mappedLogs = records.map((r) => ({
      id: r.id || `CC-${r.workno}-${r.checktime}`,
      userCode: String(r.workno || '').trim(),
      employeeNameHint: String(r.name || '').replace(/\s+/g, ' ').trim(),
      departmentHint: r.department_name || 'Regondi srl',
      timestamp: new Date(r.checktime).toISOString(),
      branch: r.device_name || r.device || 'Neuquen 959',
      verifyDesc: r.checktype === 130 ? 'PIN / Teclado' : 'Huella Dactilar',
      checktype: r.checktype || 128,
      manual: r.source === 1,
      note: r.note || ''
    }));

    const logStats = this.appendLogs(mappedLogs);

    return {
      devicesCount: devices.length,
      employeesSynced: empAdded,
      recordsTotal: logStats.total,
      recordsAdded: logStats.added
    };
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
   * Elimina una fichada errónea por ID y registra su Tombstone (Directiva 6)
   */
  static deleteLog(logId) {
    this.addTombstone(logId);
    let logs = this.getRawLogs();
    logs = logs.filter((l) => l.id !== logId);
    writeJson(LOGS_FILE, logs);
    return true;
  }

  /**
   * Resuelve a qué empleado corresponde una fichada según su workno / ID de reloj y sucursal
   */
  static resolveEmployee(userCode, branch, employees) {
    const code = String(userCode || '').trim();
    if (!code) return null;

    const bStr = String(branch || '').toLowerCase();
    const isBranch2 = bStr.includes('2') || bStr.includes('ballarini') || bStr.includes('ballerini');

    return (
      employees.find((emp) => {
        if (String(emp.workno || '').trim() === code) return true;
        if (isBranch2 && String(emp.clockIdBranch2 || '').trim() === code) return true;
        if (!isBranch2 && String(emp.clockIdBranch1 || '').trim() === code) return true;
        return String(emp.clockIdBranch1 || '').trim() === code || String(emp.clockIdBranch2 || '').trim() === code;
      }) || null
    );
  }

  /**
   * Filtra rebotes en menos de 3 minutos (apoyó 2 veces seguidas el dedo por duda)
   */
  static filterBounces(logs, windowMinutes = 3) {
    if (!Array.isArray(logs) || logs.length === 0) return [];
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

      if (diffMinutes >= 0 && diffMinutes < windowMinutes) {
        continue;
      }
      filtered.push(current);
    }

    return filtered;
  }

  /**
   * Alias de deduplicación para compatibilidad de arnés de pruebas
   */
  static deduplicateLogs(logs, windowMinutes = 3) {
    return this.filterBounces(logs, windowMinutes);
  }

  /**
   * Computa la asistencia diaria para un empleado y fecha específica
   */
  static computeDailyAttendance(emp, dateStr, logs) {
    const shift = emp.shifts || {
      startTime: emp.shiftStart1 || '08:00',
      endTime: emp.shiftEnd1 || '17:00',
      toleranceMinutes: 10,
      days: emp.workDays || [1, 2, 3, 4, 5]
    };

    const targetDate = new Date(`${dateStr}T12:00:00Z`);
    const dayOfWeek = targetDate.getUTCDay();
    const isWorkDay = Array.isArray(shift.days) ? shift.days.includes(dayOfWeek) : dayOfWeek >= 1 && dayOfWeek <= 5;

    const dayLogs = (logs || []).filter((l) => {
      const loc = toArgentinaLocal(l.timestamp);
      return loc.localDate === dateStr;
    });

    const clean = this.filterBounces(dayLogs);
    const hasOddPunch = clean.length % 2 !== 0;

    let workedMinutes = 0;
    for (let i = 0; i < clean.length; i += 2) {
      if (clean[i] && clean[i + 1]) {
        const diff = new Date(clean[i + 1].timestamp).getTime() - new Date(clean[i].timestamp).getTime();
        if (diff > 0) workedMinutes += Math.floor(diff / 60000);
      }
    }

    let status = 'NORMAL';
    let lateMinutes = 0;
    const tolerance = shift.toleranceMinutes ?? 10;

    if (clean.length === 0) {
      status = isWorkDay ? 'AUSENTE' : 'FRANCO';
    } else {
      const firstTime = toArgentinaLocal(clean[0].timestamp).localTime;
      const [sh, sm] = (shift.startTime || '08:00').split(':').map(Number);
      const [ph, pm] = firstTime.split(':').map(Number);
      const diff = ph * 60 + pm - (sh * 60 + sm);
      if (diff > tolerance) {
        lateMinutes = diff;
        status = 'LLEGADA_TARDE';
      }
    }

    return {
      date: dateStr,
      employeeId: emp.id,
      name: emp.name,
      status,
      workedHours: +(workedMinutes / 60).toFixed(2),
      workedMinutes,
      lateMinutes,
      isOddPunch: hasOddPunch,
      punches: clean
    };
  }

  /**
   * Procesa las jornadas diarias de un empleado unificando fichadas de ambas sucursales (Neuquen 959 + Ballarini 1111)
   * usando la hora local Argentina (UTC-3).
   */
  static calculateAttendance(employeeId, startDateStr, endDateStr) {
    const employees = this.getEmployees();
    const emp = employees.find((e) => e.id === employeeId || String(e.workno) === String(employeeId));
    if (!emp) return null;

    const allLogs = this.getRawLogs();

    const empLogs = allLogs.filter((log) => {
      const matched = this.resolveEmployee(log.userCode, log.branch, employees);
      return matched && matched.id === emp.id;
    });

    // Agrupar por fecha local de Argentina (YYYY-MM-DD)
    const byDate = new Map();
    for (const log of empLogs) {
      const loc = toArgentinaLocal(log.timestamp);
      if (!byDate.has(loc.localDate)) byDate.set(loc.localDate, []);
      byDate.get(loc.localDate).push({
        ...log,
        localDate: loc.localDate,
        localTime: loc.localTime.slice(0, 5),
        localTimeFull: loc.localTime
      });
    }

    const start = new Date(`${startDateStr}T00:00:00Z`);
    const end = new Date(`${endDateStr}T00:00:00Z`);
    const daysReport = [];

    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const curDateStr = d.toISOString().slice(0, 10);
      const dayOfWeek = d.getUTCDay();
      const isWorkDay = Array.isArray(emp.workDays) ? emp.workDays.includes(dayOfWeek) : dayOfWeek >= 1 && dayOfWeek <= 5;

      const rawPunches = byDate.get(curDateStr) || [];
      const cleanPunches = this.filterBounces(rawPunches).map((p) => {
        const loc = toArgentinaLocal(p.timestamp);
        return {
          ...p,
          localDate: loc.localDate,
          localTime: loc.localTime.slice(0, 5),
          localTimeFull: loc.localTime
        };
      });

      const pairs = [];
      for (let i = 0; i < cleanPunches.length; i += 2) {
        const inPunch = cleanPunches[i];
        const outPunch = cleanPunches[i + 1] || null;
        pairs.push({ in: inPunch, out: outPunch });
      }

      let totalMinutesWorked = 0;
      const hasOddPunch = cleanPunches.length % 2 !== 0;

      for (const pair of pairs) {
        if (pair.in && pair.out) {
          const diffMs = new Date(pair.out.timestamp).getTime() - new Date(pair.in.timestamp).getTime();
          if (diffMs > 0) {
            totalMinutesWorked += Math.floor(diffMs / (1000 * 60));
          }
        }
      }

      let status = 'NORMAL';
      let lateMinutes = 0;
      let earlyLeaveMinutes = 0;

      if (cleanPunches.length === 0) {
        status = isWorkDay ? 'AUSENTE' : 'FRANCO';
      } else if (hasOddPunch) {
        status = 'FICHADA_INCOMPLETA';
      } else {
        const firstTime = cleanPunches[0].localTime;
        if (emp.shiftStart1 && firstTime > emp.shiftStart1) {
          const [sh, sm] = emp.shiftStart1.split(':').map(Number);
          const [ph, pm] = firstTime.split(':').map(Number);
          const diff = ph * 60 + pm - (sh * 60 + sm);
          if (diff > 10) {
            lateMinutes = diff;
            status = 'LLEGADA_TARDE';
          }
        }
      }

      const hoursWorked = +(totalMinutesWorked / 60).toFixed(2);
      const normalHours = Math.min(hoursWorked, 8);
      const overtimeHours = Math.max(0, +(hoursWorked - 8).toFixed(2));

      daysReport.push({
        date: curDateStr,
        dayOfWeek,
        isWorkDay,
        status,
        punches: cleanPunches,
        pairs,
        firstIn: cleanPunches.length > 0 ? cleanPunches[0].localTime : null,
        lastOut: cleanPunches.length > 1 ? cleanPunches[cleanPunches.length - 1].localTime : null,
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

    const totalHrs = +daysReport.reduce((acc, d) => acc + d.hoursWorked, 0).toFixed(2);
    return {
      employeeId: emp.id,
      name: emp.name,
      employee: emp,
      range: { startDate: startDateStr, endDate: endDateStr },
      days: daysReport,
      summary: {
        totalDays: daysReport.length,
        daysWorked: daysReport.filter((d) => d.punches.length > 0).length,
        absentDays: daysReport.filter((d) => d.status === 'AUSENTE').length,
        oddPunchDays: daysReport.filter((d) => d.hasOddPunch).length,
        lateDays: daysReport.filter((d) => d.lateMinutes > 10).length,
        totalHours: totalHrs,
        totalWorkedHours: totalHrs,
        totalNormalHours: +daysReport.reduce((acc, d) => acc + d.normalHours, 0).toFixed(2),
        totalOvertimeHours: +daysReport.reduce((acc, d) => acc + d.overtimeHours, 0).toFixed(2)
      }
    };
  }

  /**
   * Monitor en vivo y Estadísticas de Dashboard (estilo CrossChex Cloud)
   */
  static getLiveStatus(referenceDateStr) {
    const employees = this.getEmployees();
    const devices = this.getDevices();
    const allLogs = this.getRawLogs();

    const nowLocal = toArgentinaLocal(new Date().toISOString());
    const todayStr = referenceDateStr || nowLocal.localDate;

    // Calcular fecha de ayer
    const todayObj = new Date(`${todayStr}T12:00:00Z`);
    const yesterdayObj = new Date(todayObj.getTime() - 24 * 3600 * 1000);
    const yesterdayStr = yesterdayObj.toISOString().slice(0, 10);

    let yesterdayLate = 0;
    let yesterdayEarly = 0;
    let yesterdayAbsent = 0;
    let yesterdayOvertime = 0;
    let yesterdayException = 0;

    const liveList = employees.map((emp) => {
      const empLogs = allLogs.filter((log) => {
        const matches = this.resolveEmployee(log.userCode, log.branch, employees);
        return matches && matches.id === emp.id;
      });

      const todayLogs = empLogs.filter((l) => toArgentinaLocal(l.timestamp).localDate === todayStr);
      const yesterdayLogs = empLogs.filter((l) => toArgentinaLocal(l.timestamp).localDate === yesterdayStr);

      const cleanToday = this.filterBounces(todayLogs).map((l) => ({
        ...l,
        localTime: toArgentinaLocal(l.timestamp).localTime.slice(0, 5),
        localTimeFull: toArgentinaLocal(l.timestamp).localTime
      }));

      const cleanYesterday = this.filterBounces(yesterdayLogs);
      if (cleanYesterday.length === 0) {
        const yDow = yesterdayObj.getUTCDay();
        if (yDow >= 1 && yDow <= 5 && emp.workno !== '1') yesterdayAbsent++;
      } else {
        if (cleanYesterday.length % 2 === 1) yesterdayException++;
        const firstY = toArgentinaLocal(cleanYesterday[0].timestamp).localTime.slice(0, 5);
        if (emp.shiftStart1 && firstY > emp.shiftStart1) {
          const [sh, sm] = emp.shiftStart1.split(':').map(Number);
          const [ph, pm] = firstY.split(':').map(Number);
          if (ph * 60 + pm - (sh * 60 + sm) > 10) yesterdayLate++;
        }
        if (cleanYesterday.length >= 2) {
          const diffH =
            (new Date(cleanYesterday[cleanYesterday.length - 1].timestamp).getTime() -
              new Date(cleanYesterday[0].timestamp).getTime()) /
            (1000 * 3600);
          if (diffH > 8.5) yesterdayOvertime++;
        }
      }

      const lastPunch = cleanToday.length > 0 ? cleanToday[cleanToday.length - 1] : null;
      const firstPunch = cleanToday.length > 0 ? cleanToday[0] : null;
      const isInside = cleanToday.length % 2 === 1;
      const branchesToday = Array.from(new Set(cleanToday.map((p) => p.branch)));

      return {
        id: emp.id,
        workno: emp.workno || emp.clockIdBranch1 || emp.dni,
        name: emp.name,
        dni: emp.dni,
        department: emp.department || 'Regondi srl',
        position: emp.position || '',
        isInside,
        hasPunchedToday: cleanToday.length > 0,
        status: !lastPunch ? 'SIN_FICHAR' : isInside ? 'PRESENTE' : 'RETIRADO',
        firstPunchTime: firstPunch ? firstPunch.localTime : null,
        lastBranch: lastPunch ? lastPunch.branch : null,
        lastPunchTime: lastPunch ? lastPunch.localTimeFull : null,
        branchesToday,
        todayPunchesCount: cleanToday.length,
        todayPunches: cleanToday
      };
    });

    const activeEmployees = employees.filter((e) => e.status !== 'INACTIVE');
    const punchedTodayCount = liveList.filter((x) => x.hasPunchedToday).length;
    const insideNowCount = liveList.filter((x) => x.isInside).length;
    const absentTodayList = liveList.filter((x) => !x.hasPunchedToday && x.workno !== '1');

    const presentList = liveList.filter((x) => x.isInside);
    const absentList = liveList.filter((x) => !x.hasPunchedToday);

    return {
      totalEmployees: activeEmployees.length,
      present: presentList,
      absent: absentList,
      live: liveList,
      dashboard: {
        todayDate: todayStr,
        totalExpected: activeEmployees.length,
        actualAttendance: punchedTodayCount,
        insideNowCount,
        absentTodayCount: absentTodayList.length,
        absentTodayList: absentTodayList.slice(0, 12),
        totalRecords: allLogs.length,
        onlineDevices: devices.filter((d) => d.status === 'ONLINE').length,
        totalDevices: devices.length,
        yesterdayStats: {
          date: yesterdayStr,
          late: yesterdayLate,
          early: yesterdayEarly,
          absent: yesterdayAbsent,
          overtime: yesterdayOvertime,
          exception: yesterdayException
        }
      }
    };
  }
}
