// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AnvizProtocolEngine } from '../engine/AnvizProtocolEngine.mjs';
import { AttendanceEngine, toArgentinaLocal } from '../engine/AttendanceEngine.mjs';

describe('1. Anviz Protocol Engine - Reverse Engineering Tests', () => {
  it('Debe calcular el CRC16 exacto capturado en la red para el comando 0x3C (GET_RECORD_INFO)', () => {
    // Trama de solicitud: A5 00 00 00 01 3C 00 00 -> CRC LE: 49 A9
    const pkt = AnvizProtocolEngine.buildPacket(1, AnvizProtocolEngine.CMD.GET_RECORD_INFO);
    assert.strictEqual(pkt.length, 10);
    assert.strictEqual(pkt[0], 0xa5);
    assert.strictEqual(pkt[5], 0x3c);
    // Verificar los dos últimos bytes
    assert.strictEqual(pkt[8], 0x49);
    assert.strictEqual(pkt[9], 0xa9);
  });

  it('Debe calcular el CRC16 exacto capturado para el comando 0x48 (GET_DEVICE_MODEL)', () => {
    // Trama de solicitud: A5 00 00 00 01 48 00 00 -> CRC LE: F0 4A
    const pkt = AnvizProtocolEngine.buildPacket(1, AnvizProtocolEngine.CMD.GET_DEVICE_MODEL);
    assert.strictEqual(pkt[8], 0xf0);
    assert.strictEqual(pkt[9], 0x4a);
  });

  it('Debe calcular el CRC16 exacto capturado para el comando 0x30 (GET_INFO1)', () => {
    // Trama de solicitud: A5 00 00 00 01 30 00 00 -> CRC LE: EA 0C
    const pkt = AnvizProtocolEngine.buildPacket(1, AnvizProtocolEngine.CMD.GET_INFO1);
    assert.strictEqual(pkt[8], 0xea);
    assert.strictEqual(pkt[9], 0x0c);
  });

  it('Debe construir tramas correctas con Device ID real (ej: 1930 Neuquen 959)', () => {
    const pkt = AnvizProtocolEngine.buildPacket(1930, AnvizProtocolEngine.CMD.GET_DEVICE_MODEL);
    assert.strictEqual(pkt.readUInt32BE(1), 1930);
    assert.strictEqual(pkt[5], 0x48);
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
    // Payload de 18 bytes: 26 usuarios, 36 huellas, 22 passwords, 0 tarjetas, 15000 fichadas
    const payload = Buffer.alloc(18);
    payload.writeUIntBE(26, 0, 3);
    payload.writeUIntBE(36, 3, 3);
    payload.writeUIntBE(22, 6, 3);
    payload.writeUIntBE(0, 9, 3);
    payload.writeUIntBE(15000, 12, 3);
    payload.writeUIntBE(10, 15, 3);

    const recInfo = AnvizProtocolEngine.parseRecordInfo(payload);
    assert.strictEqual(recInfo?.usersCount, 26);
    assert.strictEqual(recInfo?.fingerprintsCount, 36);
    assert.strictEqual(recInfo?.allRecordsCount, 15000);
  });

  it('Debe rechazar paquetes corruptos o con CRC alterado', () => {
    const valid = AnvizProtocolEngine.buildResponsePacket(1930, 0xb0, 0x00, Buffer.from([0x01, 0x02]));
    valid[valid.length - 1] ^= 0xff;
    const parsed = AnvizProtocolEngine.parseResponse(valid);
    assert.strictEqual(parsed.valid, false);
    assert.ok(parsed.error?.includes('CRC16'));
  });
});

describe('2. Attendance Engine - Datos Reales de Regondi srl y Horarios', () => {
  it('Debe convertir timestamps UTC a hora local Argentina (UTC-3)', () => {
    const loc = toArgentinaLocal('2026-10-30T16:31:03Z');
    assert.strictEqual(loc.localDate, '2026-10-30');
    assert.strictEqual(loc.localTime, '13:31:03');
  });

  it('Debe resolver al empleado tanto en Neuquen 959 como en Ballarini 1111', () => {
    const emps = AttendanceEngine.getEmployees();
    assert.ok(emps.length >= 20, 'Deben existir los empleados reales importados');

    const matchNelson = AttendanceEngine.resolveEmployee('3004', 'Neuquen 959', emps);
    assert.ok(matchNelson, 'Debe resolver a Nelson Lezcano');
    assert.ok(matchNelson.name.toLowerCase().includes('lezcano'));

    const matchBallarini = AttendanceEngine.resolveEmployee('3256', 'Ballarini 1111', emps);
    assert.ok(matchBallarini, 'Debe resolver a Gutierrez Diego');
    assert.ok(matchBallarini.name.toLowerCase().includes('gutierrez'));
  });

  it('Debe filtrar rebotes consecutivos de menos de 3 minutos', () => {
    const logs = [
      { timestamp: '2026-10-30T11:00:00Z', userCode: '3004' },
      { timestamp: '2026-10-30T11:01:15Z', userCode: '3004' },
      { timestamp: '2026-10-30T16:00:00Z', userCode: '3004' }
    ];
    const filtered = AttendanceEngine.filterBounces(logs, 3);
    assert.strictEqual(filtered.length, 2);
  });

  it('Debe calcular métricas del reporte T&A para un empleado real', () => {
    const emps = AttendanceEngine.getEmployees();
    const emp = emps[0];
    const report = AttendanceEngine.calculateAttendance(emp.id, '2026-10-01', '2026-10-30');
    assert.ok(report);
    assert.strictEqual(report.employee.id, emp.id);
    assert.ok(typeof report.summary.totalHours === 'number');
    assert.ok(report.days.length === 30);
  });
});
