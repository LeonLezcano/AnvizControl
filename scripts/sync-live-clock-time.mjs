import net from 'node:net';
import { AnvizProtocolEngine } from '../engine/AnvizProtocolEngine.mjs';

const ip = '192.168.0.218';
const port = 5010;
const devId = 1930;

console.log(`[SYNC TIME] Sincronizando hora exacta con el reloj en ${ip}:${port}...`);

const socket = new net.Socket();
socket.setTimeout(4000);

socket.connect(port, ip, () => {
  const now = new Date();
  console.log(`Hora local del servidor a sincronizar: ${now.toLocaleString('es-AR')}`);

  // Construir comando SET_DATETIME (0x39) con los 6 bytes codificados
  const timeData = AnvizProtocolEngine.encodeDateTime(now);
  const packetSet = AnvizProtocolEngine.buildPacket(devId, AnvizProtocolEngine.CMD.SET_DATETIME, timeData);
  console.log(`📤 Enviando SET_DATETIME: ${packetSet.toString('hex').toUpperCase()}`);
  socket.write(packetSet);

  // Leer inmediatamente para confirmar
  setTimeout(() => {
    const packetGet = AnvizProtocolEngine.buildPacket(devId, AnvizProtocolEngine.CMD.GET_DATETIME);
    socket.write(packetGet);
  }, 300);
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
      // 0xB9 = Respuesta a SET_DATETIME
      if (parsed.retCmd === 0xB9) {
        console.log(`✔ SET_DATETIME aceptado por el reloj (Status: 0x${parsed.status.toString(16)} - ${parsed.status === 0 ? 'EXITO' : 'ERROR'})`);
      }

      // 0xB8 = Respuesta a GET_DATETIME
      if (parsed.retCmd === 0xB8) {
        const dt = AnvizProtocolEngine.parseDateTime(parsed.data);
        console.log(`⏰ Nueva Hora Confirmada en Hardware: ${dt.formatted}`);
      }
    }

    offset += totalFrameLen;
  }
});

setTimeout(() => {
  socket.end();
}, 1500);

socket.on('close', () => {
  console.log('✔ Proceso de sincronización horario concluido.');
});
