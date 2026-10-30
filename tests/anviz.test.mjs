// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AnvizProtocolEngine } from '../engine/AnvizProtocolEngine.mjs';
import { AttendanceEngine } from '../engine/AttendanceEngine.mjs';

describe('1. Anviz Protocol Engine - Reverse Engineering Tests', () => {
  it('Debe calcular correctamente el CRC16 de Anviz', () => {
    // Un buffer simple de prueba
    const testBuf = Buffer.from([0xa5, 0x00, 0x00, 0x00, 0x01, 0x30, 0x00, 0x00]);
    const crc = AnvizProtocolEngine.calcCRC16(testBuf);
    assert.strictEqual(typeof crc, 'number');
    assert.ok(crc > 0 && crc <= 0xffff);
  });

  it('Debe construir un paquete binario válido de Anviz con STX 0xA5 y CRC final', () => {
    const devId = 1;
    const cmd = AnvizProtocolEngine.CMD.GET_INFO1; // 0x30
    const packet = AnvizProtocolEngine.buildPacket(devId, cmd);

    assert.strictEqual(packet[0], 0xa5, 'El primer byte debe ser STX 0xA5');
    assert.strictEqual(packet.readUInt32BE(1), 1, 'Device ID debe ser 1');
    assert.strictEqual(packet[5], 0x30, 'CMD debe ser 0x30');
    assert.strictEqual(packet.readUInt16BE(6), 0, 'Longitud de payload debe ser 0');

    // Comprobar validación de CRC del propio paquete
    const crcInPacket = packet.readUInt16BE(packet.length - 2);
    const calculatedCrc = AnvizProtocolEngine.calcCRC16(packet.subarray(0, packet.length - 2));
    assert.strictEqual(crcInPacket, calculatedCrc, 'El CRC incrustado debe coincidir');
  });

  it('Debe rechazar paquetes corruptos o con CRC inválido', () => {
    const validResponse = AnvizProtocolEngine.buildResponsePacket(1, 0xb0, 0x00, Buffer.from([0x01]));
    // Corromper el último byte del CRC
    validResponse[validResponse.length - 1] ^= 0xff;

    const parsed = AnvizProtocolEngine.parseResponse(validResponse);
    assert.strictEqual(parsed.valid, false);
    assert.ok(parsed.error?.includes('CRC16'));
  });

  it('Debe decodificar timestamp de Anviz correctamente', () => {
    // 0 segundos desde época Anviz (2000-01-02 00:00:00 UTC)
    const dt = AnvizProtocolEngine.decodeAnvizTimestamp(700000000); // año aprox 2022
    assert.ok(dt instanceof Date);
    assert.ok(!isNaN(dt.getTime()));
    assert.ok(dt.getUTCFullYear() >= 2020);
  });
});

describe('2. Attendance Engine - Multi-Sucursal y Deducción Inteligente', () => {
  it('Debe resolver el legajo del empleado aunque tenga distinto ID en Reloj 1 y Reloj 2', () => {
    const employees = [
      { id: 'EMP-01', name: 'Juan', clockIdBranch1: '5', clockIdBranch2: '105' }
    ];

    const match1 = AttendanceEngine.resolveEmployee('5', 'Sucursal 1 (Local)', employees);
    assert.strictEqual(match1?.id, 'EMP-01');

    const match2 = AttendanceEngine.resolveEmployee('105', 'Sucursal 2 (5 cuadras)', employees);
    assert.strictEqual(match2?.id, 'EMP-01');
  });

  it('Debe filtrar rebotes (apoyó 2 veces el dedo en menos de 3 minutos)', () => {
    const rawPunches = [
      { timestamp: '2026-10-30T08:00:00.000Z', userCode: '1' },
      { timestamp: '2026-10-30T08:00:45.000Z', userCode: '1' }, // Rebote a 45 seg
      { timestamp: '2026-10-30T17:00:00.000Z', userCode: '1' }
    ];

    const filtered = AttendanceEngine.filterBounces(rawPunches, 3);
    assert.strictEqual(filtered.length, 2, 'Debe haber descartado la segunda fichada idéntica');
    assert.strictEqual(filtered[0].timestamp, '2026-10-30T08:00:00.000Z');
    assert.strictEqual(filtered[1].timestamp, '2026-10-30T17:00:00.000Z');
  });

  it('Debe detectar fichada incompleta (impar) cuando olvida fichar la salida', () => {
    const empId = 'TEST-EMP';
    AttendanceEngine.saveEmployee({
      id: empId,
      name: 'Tester',
      dni: '11111111',
      clockIdBranch1: '999',
      clockIdBranch2: '999',
      scheduleType: 'CORRIDO',
      shiftStart1: '08:00',
      shiftEnd1: '17:00',
      workDays: [1, 2, 3, 4, 5]
    });

    // Agregar solo 1 fichada de entrada
    AttendanceEngine.appendLogs([
      {
        userCode: '999',
        branch: 'Sucursal 1',
        timestamp: '2026-10-15T08:01:00.000Z'
      }
    ]);

    const report = AttendanceEngine.calculateAttendance(empId, '2026-10-15', '2026-10-15');
    assert.ok(report);
    assert.strictEqual(report.days[0].hasOddPunch, true);
    assert.strictEqual(report.days[0].status, 'FICHADA_INCOMPLETA');

    // Limpieza
    AttendanceEngine.deleteEmployee(empId);
  });
});
