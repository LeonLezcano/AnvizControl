import net from 'node:net';
import { AnvizProtocolEngine } from '../engine/AnvizProtocolEngine.mjs';

const ip = '192.168.0.218';
const port = 5010;
const devId = 1930;

console.log(`[TEST LIVE] Conectando por TCP Socket a ${ip}:${port} (DevId: ${devId})...`);

const socket = new net.Socket();
socket.setTimeout(4000);

socket.connect(port, ip, () => {
  console.log(`✔ Conexión TCP establecida con el reloj biométrico Anviz VF30 Pro`);

  // 1. Enviar GET_RECORD_INFO (0x3C)
  const packetInfo = AnvizProtocolEngine.buildPacket(devId, AnvizProtocolEngine.CMD.GET_RECORD_INFO);
  socket.write(packetInfo);

  // 2. Enviar GET_DATETIME (0x38)
  setTimeout(() => {
    const packetTime = AnvizProtocolEngine.buildPacket(devId, AnvizProtocolEngine.CMD.GET_DATETIME);
    socket.write(packetTime);
  }, 200);
});

socket.on('data', (data) => {
  let offset = 0;
  while (offset < data.length) {
    if (data[offset] !== AnvizProtocolEngine.STX) {
      offset++;
      continue;
    }

    if (offset + 9 > data.length) break;
    const dataLen = data.readUInt16BE(offset + 7);
    const totalFrameLen = 9 + dataLen + 2;

    if (offset + totalFrameLen > data.length) break;

    const frame = data.subarray(offset, offset + totalFrameLen);
    const parsed = AnvizProtocolEngine.parseResponse(frame);

    if (parsed.valid) {
      // 0xBC = Respuesta a GET_RECORD_INFO
      if (parsed.retCmd === 0xBC) {
        const info = AnvizProtocolEngine.parseRecordInfo(parsed.data);
        console.log('\n📊 ESTADO DEL RELOJ ANVIZ VF30 PRO (Neuquén 959):');
        console.log(`   👥 Total Empleados Registrados:  ${info.usersCount}`);
        console.log(`   👆 Total Huellas en Memoria:     ${info.fingerprintsCount}`);
        console.log(`   🔑 Contraseñas de Acceso:        ${info.passwordsCount}`);
        console.log(`   📑 Total Histórico de Fichadas:  ${info.allRecordsCount}`);
        console.log(`   🆕 Fichadas Nuevas en Reloj:     ${info.newRecordsCount}`);
      }

      // 0xB8 = Respuesta a GET_DATETIME
      if (parsed.retCmd === 0xB8) {
        const dt = AnvizProtocolEngine.parseDateTime(parsed.data);
        console.log('\n⏰ HORA ACTUAL EN HARDWARE DEL RELOJ:');
        console.log(`   Hardware Clock: ${dt.formatted}`);
        console.log(`   Server Local:   ${new Date().toLocaleString('es-AR')}`);
      }
    }

    offset += totalFrameLen;
  }
});

setTimeout(() => {
  socket.end();
}, 1500);

socket.on('timeout', () => {
  console.log(`⏳ Timeout al comunicar con ${ip}`);
  socket.destroy();
});

socket.on('error', (err) => {
  console.error(`✖ Error TCP:`, err.message);
});

socket.on('close', () => {
  console.log('\n✔ Sesión de comunicación TCP finalizada exitosamente.');
});
