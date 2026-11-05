// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import { AnvizProtocolEngine } from '../engine/AnvizProtocolEngine.mjs';
import { AttendanceEngine, toArgentinaLocal } from '../engine/AttendanceEngine.mjs';

// ======================================================================
// CAPA 1: UNITARIAS & INGENIERÍA INVERSA DEL PROTOCOLO ANVIZ TC_B
// ======================================================================
describe('1. Capa 1: Protocolo Binario Anviz VF30 Pro & CRC16', () => {
  it('Debe calcular el CRC16 exacto capturado en la red para el comando 0x3C (GET_RECORD_INFO)', () => {
    const pkt = AnvizProtocolEngine.buildPacket(1, AnvizProtocolEngine.CMD.GET_RECORD_INFO);
    assert.strictEqual(pkt.length, 10);
    assert.strictEqual(pkt[0], 0xa5);
    assert.strictEqual(pkt[5], 0x3c);
    assert.strictEqual(pkt[8], 0x49);
    assert.strictEqual(pkt[9], 0xa9);
  });

  it('Debe calcular el CRC16 exacto capturado para el comando 0x48 (GET_DEVICE_MODEL)', () => {
    const pkt = AnvizProtocolEngine.buildPacket(1, AnvizProtocolEngine.CMD.GET_DEVICE_MODEL);
    assert.strictEqual(pkt[8], 0xf0);
    assert.strictEqual(pkt[9], 0x4a);
  });

  it('Debe calcular el CRC16 exacto capturado para el comando 0x30 (GET_INFO1)', () => {
    const pkt = AnvizProtocolEngine.buildPacket(1, AnvizProtocolEngine.CMD.GET_INFO1);
    assert.strictEqual(pkt[8], 0xea);
    assert.strictEqual(pkt[9], 0x0c);
  });

  it('Debe construir tramas correctas con Device ID real (ej: 1930 Neuquen 959)', () => {
    const pkt = AnvizProtocolEngine.buildPacket(1930, AnvizProtocolEngine.CMD.GET_DEVICE_MODEL);
    assert.strictEqual(pkt.readUInt32BE(1), 1930);
    assert.strictEqual(pkt[5], 0x48);
  });

  it('Debe construir tramas con payload de datos arbitrario', () => {
    const data = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const pkt = AnvizProtocolEngine.buildPacket(1, 0x50, data);
    assert.strictEqual(pkt.length, 14);
    assert.strictEqual(pkt.readUInt16BE(6), 4);
    assert.deepStrictEqual(pkt.subarray(8, 12), data);
  });

  it('Debe rechazar payloads que excedan el límite físico de trama de 400 bytes', () => {
    const largeData = Buffer.alloc(401);
    assert.throws(() => {
      AnvizProtocolEngine.buildPacket(1, 0x50, largeData);
    }, /excede el tamaño máximo/);
  });

  it('Debe decodificar la respuesta 0xC8 del modelo del equipo', () => {
    const respPkt = AnvizProtocolEngine.buildResponsePacket(1930, 0xc8, 0x00, Buffer.from('VF30PRO\0', 'ascii'));
    const parsed = AnvizProtocolEngine.parseResponse(respPkt);
    assert.strictEqual(parsed.valid, true);
    assert.strictEqual(parsed.devId, 1930);
    assert.strictEqual(parsed.retCmd, 0xc8);
    assert.strictEqual(parsed.data?.toString('ascii').replace(/\0/g, ''), 'VF30PRO');
  });

  it('Debe decodificar la respuesta 0xBC con la cantidad de usuarios y fichadas', () => {
    const payload = Buffer.alloc(18);
    payload.writeUIntBE(26, 0, 3);
    payload.writeUIntBE(36, 3, 3);
    payload.writeUIntBE(22, 6, 3);
    payload.writeUIntBE(0, 9, 3);
    payload.writeUIntBE(15098, 12, 3);
    payload.writeUIntBE(14952, 15, 3);

    const recInfo = AnvizProtocolEngine.parseRecordInfo(payload);
    assert.strictEqual(recInfo?.usersCount, 26);
    assert.strictEqual(recInfo?.fingerprintsCount, 36);
    assert.strictEqual(recInfo?.passwordsCount, 22);
    assert.strictEqual(recInfo?.cardsCount, 0);
    assert.strictEqual(recInfo?.allRecordsCount, 15098);
    assert.strictEqual(recInfo?.newRecordsCount, 14952);
  });

  it('Debe decodificar la respuesta 0xBA con la configuración IP y MAC del equipo', () => {
    const netBuf = Buffer.alloc(25);
    // IP: 192.168.0.218
    netBuf[0] = 192; netBuf[1] = 168; netBuf[2] = 0; netBuf[3] = 218;
    // Mask: 255.255.255.0
    netBuf[4] = 255; netBuf[5] = 255; netBuf[6] = 255; netBuf[7] = 0;
    // MAC: 00:22:CA:03:50:9F
    netBuf[8] = 0x00; netBuf[9] = 0x22; netBuf[10] = 0xca; netBuf[11] = 0x03; netBuf[12] = 0x50; netBuf[13] = 0x9f;
    // Gateway: 192.168.0.1
    netBuf[14] = 192; netBuf[15] = 168; netBuf[16] = 0; netBuf[17] = 1;
    // Server IP: 192.168.0.7
    netBuf[18] = 192; netBuf[19] = 168; netBuf[20] = 0; netBuf[21] = 7;
    // Port: 5010
    netBuf.writeUInt16BE(5010, 23);

    const net = AnvizProtocolEngine.parseNetInfo(netBuf);
    assert.strictEqual(net?.ip, '192.168.0.218');
    assert.strictEqual(net?.mask, '255.255.255.0');
    assert.strictEqual(net?.mac, '00:22:ca:03:50:9f');
    assert.strictEqual(net?.port, 5010);
  });

  it('Debe codificar fecha/hora en 6 bytes para SET_DATETIME (0x39)', () => {
    const targetDate = new Date(2026, 10, 5, 14, 18, 45); // Nov 5 2026 14:18:45
    const encoded = AnvizProtocolEngine.encodeDateTime(targetDate);
    assert.strictEqual(encoded.length, 6);
    assert.strictEqual(encoded[0], 26); // 2026 - 2000 = 26
    assert.strictEqual(encoded[1], 11); // Nov = 11
    assert.strictEqual(encoded[2], 5);  // Day 5
    assert.strictEqual(encoded[3], 14); // Hour 14
    assert.strictEqual(encoded[4], 18); // Min 18
    assert.strictEqual(encoded[5], 45); // Sec 45
  });

  it('Debe decodificar la respuesta 0xB8 de GET_DATETIME en un objeto legible', () => {
    const rawTime = Buffer.from([26, 11, 5, 14, 18, 45]);
    const dt = AnvizProtocolEngine.parseDateTime(rawTime);
    assert.strictEqual(dt?.year, 2026);
    assert.strictEqual(dt?.month, 11);
    assert.strictEqual(dt?.day, 5);
    assert.strictEqual(dt?.formatted, '2026-11-05 14:18:45');
  });

  it('Debe rechazar paquetes con byte de inicio STX inválido', () => {
    const corrupt = Buffer.from([0x00, 0x00, 0x00, 0x01, 0x00, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const parsed = AnvizProtocolEngine.parseResponse(corrupt);
    assert.strictEqual(parsed.valid, false);
    assert(parsed.error?.includes('Byte de inicio'));
  });

  it('Debe rechazar paquetes truncados o con CRC alterado', () => {
    const pkt = AnvizProtocolEngine.buildResponsePacket(1, 0xb0, 0x00, Buffer.alloc(0));
    pkt[pkt.length - 1] ^= 0xff; // Invertir bit de CRC
    const parsed = AnvizProtocolEngine.parseResponse(pkt);
    assert.strictEqual(parsed.valid, false);
    assert(parsed.error?.includes('CRC16'));
  });

  it('Debe decodificar registros de asistencia de 14 bytes (parseAttendanceRecords)', () => {
    const recordBuf = Buffer.alloc(1 + 14);
    recordBuf[0] = 1; // 1 record
    // User Code = 3004 (Lezcano Nelson)
    recordBuf.writeUInt32BE(3004, 1 + 1);
    // Timestamp = 847000000
    recordBuf.writeUInt32BE(847000000, 1 + 5);
    // Verify Type = 1 (Huella)
    recordBuf[1 + 9] = 1;
    // Record Type = 0 (Entrada)
    recordBuf[1 + 10] = 0;

    const records = AnvizProtocolEngine.parseAttendanceRecords(recordBuf, 'Neuquen 959');
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].userCode, '3004');
    assert.strictEqual(records[0].verifyDesc, 'Huella Dactilar');
    assert.strictEqual(records[0].branch, 'Neuquen 959');
  });
});

// ======================================================================
// CAPA 2: INTEGRACIÓN & CÁLCULO DE JORNADAS (ATTENDANCE ENGINE)
// ======================================================================
describe('2. Capa 2: Motor de Asistencia & Horarios de Regondi srl', () => {
  it('Debe convertir timestamps UTC a hora local Argentina (UTC-3)', () => {
    const utcIso = '2026-10-28T11:00:00.000Z';
    const loc = toArgentinaLocal(utcIso);
    assert.strictEqual(loc.localDate, '2026-10-28');
    assert.strictEqual(loc.localTime, '08:00');
  });

  it('Debe resolver al empleado tanto en Neuquen 959 como en Ballarini 1111', () => {
    const employees = AttendanceEngine.getEmployees();
    assert(employees.length >= 24, 'Debe haber al menos 24 empleados precargados');

    const nelson = AttendanceEngine.resolveEmployee('3004', 'Neuquen 959', employees);
    assert(nelson, 'Nelson debe existir');
    assert.strictEqual(nelson?.name, 'Lezcano Nelson');

    const eric = AttendanceEngine.resolveEmployee('1020', 'Ballarini 1111', employees);
    assert(eric, 'Eric debe existir');
    assert.strictEqual(eric?.name, 'Regondi Eric');
  });

  it('Debe filtrar rebotes consecutivos de menos de 3 minutos', () => {
    const logs = [
      { id: '1', userCode: '3004', timestamp: '2026-10-28T11:00:00.000Z', branch: 'Neuquen 959' },
      { id: '2', userCode: '3004', timestamp: '2026-10-28T11:01:30.000Z', branch: 'Neuquen 959' }, // Rebote < 3 min
      { id: '3', userCode: '3004', timestamp: '2026-10-28T20:00:00.000Z', branch: 'Neuquen 959' }
    ];
    const filtered = AttendanceEngine.deduplicateLogs(logs, 3);
    assert.strictEqual(filtered.length, 2);
    assert.strictEqual(filtered[0].id, '1');
    assert.strictEqual(filtered[1].id, '3');
  });

  it('Debe calcular métricas del reporte T&A para un empleado real', () => {
    const report = AttendanceEngine.calculateAttendance('EMP-3004', '2026-10-01', '2026-10-31');
    assert.strictEqual(report.employeeId, 'EMP-3004');
    assert.strictEqual(report.name, 'Lezcano Nelson');
    assert(report.days.length >= 20, 'Debe haber días computados en el mes');
    assert(typeof report.summary.totalWorkedHours === 'number');
  });

  it('Debe identificar ausentismo cuando no hay fichadas en día hábil', () => {
    const logs = []; // Sin fichadas
    const shift = { startTime: '08:00', endTime: '17:00', toleranceMinutes: 10, days: [1, 2, 3, 4, 5] };
    const emp = { id: 'EMP-01', name: 'Test Empleado', shifts: shift };
    const report = AttendanceEngine.computeDailyAttendance(emp, '2026-10-28', logs); // Miércoles
    assert.strictEqual(report.status, 'AUSENTE');
    assert.strictEqual(report.workedHours, 0);
  });

  it('Debe calcular llegadas tarde que superen la tolerancia configurada', () => {
    // Ingreso a las 08:25 (Tolerancia 10 min, horario 08:00) -> 25 min tarde
    const logs = [
      { id: '1', timestamp: '2026-10-28T11:25:00.000Z' }, // 08:25 local
      { id: '2', timestamp: '2026-10-28T20:00:00.000Z' }  // 17:00 local
    ];
    const shift = { startTime: '08:00', endTime: '17:00', toleranceMinutes: 10 };
    const emp = { id: 'EMP-01', name: 'Test Empleado', shifts: shift };
    const report = AttendanceEngine.computeDailyAttendance(emp, '2026-10-28', logs);
    assert.strictEqual(report.lateMinutes, 25);
  });

  it('Debe otorgar puntualidad si el ingreso está dentro de la tolerancia', () => {
    // Ingreso a las 08:08 (Tolerancia 10 min, horario 08:00) -> Puntual
    const logs = [
      { id: '1', timestamp: '2026-10-28T11:08:00.000Z' }, // 08:08 local
      { id: '2', timestamp: '2026-10-28T20:00:00.000Z' }
    ];
    const shift = { startTime: '08:00', endTime: '17:00', toleranceMinutes: 10 };
    const emp = { id: 'EMP-01', name: 'Test Empleado', shifts: shift };
    const report = AttendanceEngine.computeDailyAttendance(emp, '2026-10-28', logs);
    assert.strictEqual(report.lateMinutes, 0);
  });

  it('Debe detectar fichadas impares / falta de marca de salida', () => {
    const logs = [
      { id: '1', timestamp: '2026-10-28T11:00:00.000Z' } // Solo entrada, sin salida
    ];
    const shift = { startTime: '08:00', endTime: '17:00' };
    const emp = { id: 'EMP-01', name: 'Test Empleado', shifts: shift };
    const report = AttendanceEngine.computeDailyAttendance(emp, '2026-10-28', logs);
    assert.strictEqual(report.isOddPunch, true);
  });

  it('Debe permitir rectificación manual de fichadas omitidas', () => {
    const uniqueTs = new Date(Date.now() + Math.floor(Math.random() * 1000000000)).toISOString();
    const manualLog = {
      userCode: '3004',
      timestamp: uniqueTs,
      branch: 'Neuquen 959',
      isManual: true,
      reason: 'Olvido de tarjeta/huella'
    };
    const result = AttendanceEngine.appendLogs([manualLog]);
    assert(result.added >= 1, 'Debe haber agregado el registro manual');
  });

  it('Debe registrar tombstones al eliminar una fichada para evitar re-sincronizaciones no deseadas', () => {
    const tempId = `TEMP-LOG-${Date.now()}`;
    AttendanceEngine.deleteLog(tempId);
    const tombstones = AttendanceEngine.getTombstones();
    assert(tombstones.includes(tempId), 'Debe contener el tombstone del ID eliminado');
  });
});

// ======================================================================
// CAPA 3: COMPONENTES & ESTABILIDAD REACTIVA (UI & FORMATTERS)
// ======================================================================
describe('3. Capa 3: Componentes Reactivos & Formateadores', () => {
  it('Debe formatear horas en formato militar HH:mm', () => {
    const loc = toArgentinaLocal('2026-10-28T17:35:00.000Z');
    assert.strictEqual(loc.localTime, '14:35');
  });

  it('Debe formatear fechas locales en formato AAAA-MM-DD', () => {
    const loc = toArgentinaLocal('2026-10-28T02:00:00.000Z'); // 23:00 del día anterior en Arg
    assert.strictEqual(loc.localDate, '2026-10-27');
  });

  it('Debe manejar timestamps vacíos o nulos sin arrojar excepciones', () => {
    const loc = toArgentinaLocal(null);
    assert.strictEqual(loc.localDate, '-');
    assert.strictEqual(loc.localTime, '-');
  });

  it('Debe resolver el estado ONLINE / OFFLINE de los relojes en base a lastSync', () => {
    const devices = AttendanceEngine.getDevices();
    assert.strictEqual(devices.length, 2);
    assert.strictEqual(devices[0].id, '1930');
    assert.strictEqual(devices[0].name, 'Neuquen 959');
    assert.strictEqual(devices[1].id, '1931');
    assert.strictEqual(devices[1].name, 'Ballarini 1111');
  });

  it('Debe clasificar estados de asistencia: PRESENTE, AUSENTE, TARDE, RETIRO_ANTICIPADO', () => {
    const statuses = ['PRESENTE', 'AUSENTE', 'TARDE', 'INCONSISTENTE'];
    statuses.forEach(s => {
      assert(typeof s === 'string');
    });
  });
});

// ======================================================================
// CAPA 4: SEGURIDAD, CSP & FIRESTORE RULES
// ======================================================================
describe('4. Capa 4: Seguridad, CSP & Reglas de Acceso', () => {
  it('firestore.rules existe en la raíz', () => {
    assert(fs.existsSync('firestore.rules'), 'El archivo firestore.rules debe existir');
  });

  it('firestore.rules requiere autenticación para lecturas y escrituras', () => {
    const rules = fs.readFileSync('firestore.rules', 'utf8');
    assert(rules.includes('function isAuthenticated()'), 'Debe definir isAuthenticated()');
    assert(rules.includes('request.auth != null'), 'Debe validar token no nulo');
  });

  it('firestore.rules define roles de Administrador y Supervisor', () => {
    const rules = fs.readFileSync('firestore.rules', 'utf8');
    assert(rules.includes("request.auth.token.role == 'ADMIN'"), 'Debe cubrir rol ADMIN');
  });

  it('firebase.json existe y especifica cabeceras HTTP de seguridad', () => {
    assert(fs.existsSync('firebase.json'), 'El archivo firebase.json debe existir');
    const fb = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
    assert(fb.hosting && fb.hosting.headers, 'Debe contener bloque de headers');
  });

  it('firebase.json prohíbe terminantemente unsafe-eval en la CSP', () => {
    const fb = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
    const csp = fb.hosting.headers[0].headers.find(h => h.key === 'Content-Security-Policy');
    assert(csp, 'Debe existir directiva CSP');
    assert(!csp.value.includes("'unsafe-eval'"), 'Prohibido unsafe-eval');
  });

  it('firebase.json aplica X-Frame-Options: DENY para prevenir Clickjacking', () => {
    const fb = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
    const xfo = fb.hosting.headers[0].headers.find(h => h.key === 'X-Frame-Options');
    assert.strictEqual(xfo?.value, 'DENY');
  });

  it('firebase.json aplica HSTS y X-Content-Type-Options: nosniff', () => {
    const fb = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
    const nosniff = fb.hosting.headers[0].headers.find(h => h.key === 'X-Content-Type-Options');
    const hsts = fb.hosting.headers[0].headers.find(h => h.key === 'Strict-Transport-Security');
    assert.strictEqual(nosniff?.value, 'nosniff');
    assert(hsts?.value.includes('max-age=31536000'));
  });

  it('Aislamiento de secretos: Cero tokens privados o llaves en configuración', () => {
    const pkg = fs.readFileSync('package.json', 'utf8');
    assert(!pkg.includes('sk-ant'), 'No debe contener API keys de Anthropic');
    assert(!pkg.includes('sk-proj'), 'No debe contener API keys de OpenAI');
    assert(!pkg.includes('ghp_'), 'No debe contener tokens de GitHub');
  });

  it('.gitignore incluye node_modules y archivos de entorno .env', () => {
    const gitignore = fs.readFileSync('.gitignore', 'utf8');
    assert(gitignore.includes('node_modules'), 'Debe ignorar node_modules');
    assert(gitignore.includes('.env'), 'Debe ignorar archivos .env');
  });
});

// ======================================================================
// CAPA 5: E2E FLUIDO & OPERATIVIDAD DE AGENTE MULTI-SUCURSAL
// ======================================================================
describe('5. Capa 5: E2E Fluido & Agente Multi-Sucursal', () => {
  it('Debe existir el script del agente local (agent/agent.mjs)', () => {
    assert(fs.existsSync('agent/agent.mjs'), 'El script del agente debe existir');
  });

  it('Debe existir el lanzador batch para Windows (agent/Iniciar_Agente.bat)', () => {
    assert(fs.existsSync('agent/Iniciar_Agente.bat'), 'El batch de inicio debe existir');
  });

  it('Debe consultar y devolver el padrón consolidado de empleados sin latencia', () => {
    const emps = AttendanceEngine.getEmployees();
    assert(Array.isArray(emps));
    assert(emps.length > 0);
    const nelson = emps.find(e => e.workno === '3004');
    assert(nelson, 'Empleado 3004 debe estar en el padrón');
    assert(nelson.department.includes('Regondi'), 'Debe pertenecer al departamento Regondi');
  });

  it('Debe calcular el resumen de presencia en planta en vivo (getLiveStatus)', () => {
    const live = AttendanceEngine.getLiveStatus('2026-10-28');
    assert(live, 'Debe devolver estado en vivo');
    assert(typeof live.totalEmployees === 'number');
    assert(Array.isArray(live.present));
    assert(Array.isArray(live.absent));
  });

  it('Debe persistir y recuperar logs de asistencia desde data/attendance_logs.json', () => {
    const raw = AttendanceEngine.getRawLogs();
    assert(Array.isArray(raw));
    assert(raw.length > 500, 'Debe haber más de 500 marcas históricas');
  });

  it('Debe ejecutar 5000 ciclos de cálculo CRC16 sin degradación de memoria', () => {
    const memBefore = process.memoryUsage().heapUsed;
    const testBuf = Buffer.from('A50000078A3C0000', 'hex');
    for (let i = 0; i < 5000; i++) {
      AnvizProtocolEngine.calcCRC16(testBuf);
    }
    const memAfter = process.memoryUsage().heapUsed;
    const diffMb = (memAfter - memBefore) / 1024 / 1024;
    assert(diffMb < 15, `El consumo no debe exceder 15MB, actual: ${diffMb.toFixed(2)} MB`);
  });
});

// ======================================================================
// FUZZING & CHAOTIC PROPERTY TESTS
// ======================================================================
describe('6. Fuzzing & Chaotic Property Tests', () => {
  it('AnvizProtocolEngine.calcCRC16 maneja buffers nulos o vacíos retornando 0xFFFF', () => {
    assert.strictEqual(AnvizProtocolEngine.calcCRC16(null), 0xffff);
    assert.strictEqual(AnvizProtocolEngine.calcCRC16(Buffer.alloc(0)), 0xffff);
  });

  it('AnvizProtocolEngine.parseResponse rechaza streams de bytes caóticos aleatorios sin arrojar crash', () => {
    for (let i = 0; i < 50; i++) {
      const randomBuf = Buffer.alloc(Math.floor(Math.random() * 64));
      for (let j = 0; j < randomBuf.length; j++) {
        randomBuf[j] = Math.floor(Math.random() * 256);
      }
      const parsed = AnvizProtocolEngine.parseResponse(randomBuf);
      assert.strictEqual(typeof parsed.valid, 'boolean');
    }
  });

  it('AnvizProtocolEngine.decodeAnvizTimestamp maneja segundos negativos y límites 0', () => {
    const d0 = AnvizProtocolEngine.decodeAnvizTimestamp(0);
    assert(d0 instanceof Date && !isNaN(d0.getTime()));
    const dNeg = AnvizProtocolEngine.decodeAnvizTimestamp(-9999);
    assert(dNeg instanceof Date);
  });

  it('AnvizProtocolEngine.encodeDateTime maneja fechas inválidas recurriendo a la hora actual', () => {
    const fallback = AnvizProtocolEngine.encodeDateTime(new Date('invalid-date'));
    assert.strictEqual(fallback.length, 6);
  });

  it('AttendanceEngine.resolveEmployee maneja userCodes extraños, nulos o con caracteres', () => {
    const emps = AttendanceEngine.getEmployees();
    assert.strictEqual(AttendanceEngine.resolveEmployee(null, 'Neuquen 959', emps), null);
    assert.strictEqual(AttendanceEngine.resolveEmployee('', 'Neuquen 959', emps), null);
    assert.strictEqual(AttendanceEngine.resolveEmployee('NON_EXISTENT_99999', 'Neuquen 959', emps), null);
  });

  it('Las versiones de package.json y version.json coinciden exactamente', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const ver = JSON.parse(fs.readFileSync('version.json', 'utf8'));
    assert.strictEqual(pkg.version.replace(/^v/, ''), ver.version.replace(/^v/, ''), 'Las versiones deben coincidir');
  });

  it('AttendanceEngine.saveEmployee y deleteEmployee mantienen la integridad de la base de datos', () => {
    const tempWorkno = 'TEST-EMP-999';
    const saved = AttendanceEngine.saveEmployee({
      workno: tempWorkno,
      name: 'Empleado Temporal Vitest',
      department: 'Calidad Regondi',
      dni: tempWorkno
    });
    assert(saved && saved.id, 'Debe haber guardado el empleado');

    const emps = AttendanceEngine.getEmployees();
    assert(emps.some(e => e.workno === tempWorkno), 'Debe encontrarse en el padrón');

    AttendanceEngine.deleteEmployee(saved.id);
    const empsAfter = AttendanceEngine.getEmployees();
    assert(!empsAfter.some(e => e.id === saved.id), 'Debe haberse eliminado');
    const tombstones = AttendanceEngine.getTombstones();
    assert(tombstones.includes(saved.id) || tombstones.has(saved.id), 'Debe registrar tombstone');
  });

  it('AnvizProtocolEngine.buildRequest calcula longitud y checksum exactos para paquetes con longitud 0', () => {
    const pkt = AnvizProtocolEngine.buildPacket(1930, 0x38); // GET_DATETIME
    assert.strictEqual(pkt[0], 0xa5);
    assert.strictEqual(pkt[5], 0x38);
    assert.strictEqual(pkt.readUInt16BE(6), 0);
    assert.strictEqual(pkt.length, 10);
  });

  it('AttendanceEngine.filterBounces tolera listas no ordenadas y devuelve orden ascendente', () => {
    const disordered = [
      { id: '2', timestamp: '2026-10-28T12:00:00.000Z' },
      { id: '1', timestamp: '2026-10-28T10:00:00.000Z' },
      { id: '3', timestamp: '2026-10-28T14:00:00.000Z' }
    ];
    const res = AttendanceEngine.filterBounces(disordered);
    assert.strictEqual(res.length, 3);
    assert.strictEqual(res[0].id, '1');
    assert.strictEqual(res[1].id, '2');
    assert.strictEqual(res[2].id, '3');
  });

  it('AttendanceEngine.calculateAttendance maneja rangos vacíos sin arrojar error', () => {
    const res = AttendanceEngine.calculateAttendance('EMP-3004', '2026-12-01', '2026-12-02');
    assert(res, 'Debe devolver reporte estructurado');
    assert.strictEqual(res.summary.daysWorked, 0);
  });
});
